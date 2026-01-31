/**
 * خدمة جلب البيانات عند الطلب - On-Demand Data Service
 *
 * بدلاً من تخزين كل البيانات في قاعدة البيانات (يستهلك GB)
 * نجلب البيانات مباشرة من API عند الحاجة ونخزنها مؤقتاً في Redis
 */

import axios from 'axios';
import Papa from 'papaparse';
import { cacheGet, cacheSet, CacheKeys } from './cache.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface DatasetData {
  id: string;
  records: Record<string, unknown>[];
  columns: string[];
  totalRecords: number;
  fetchedAt: string;
  source: 'api' | 'cache';
}

export interface DatasetResource {
  id: string;
  name: string;
  format: string;
  downloadUrl: string;
  size?: number;
}

export interface DatasetMetadata {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  providerNameEn?: string;
  providerNameAr?: string;
  categories?: { titleAr: string; titleEn: string }[];
  tags?: string[];
  updateFrequency?: string;
  createdAt?: string;
  updatedAt?: string;
  resources?: DatasetResource[];
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const API_BASE = 'https://open.data.gov.sa/data/api';
const CACHE_TTL = 3600; // 1 hour cache
const CACHE_TTL_METADATA = 86400; // 24 hours for metadata
const REQUEST_TIMEOUT = 60000; // 60 seconds

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function getCacheKey(datasetId: string, type: 'data' | 'meta' = 'data'): string {
  return `ondemand:${type}:${datasetId}`;
}

async function fetchWithRetry<T>(
  url: string,
  options: { retries?: number; timeout?: number } = {}
): Promise<T> {
  const { retries = 3, timeout = REQUEST_TIMEOUT } = options;
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'InvestorRadar/2.0',
          'Accept': 'application/json',
          'Accept-Language': 'ar,en',
        },
      });
      return response.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      logger.warn(`Retry ${i + 1}/${retries} failed for ${url}: ${lastError.message}`);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }

  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * جلب metadata الـ Dataset من الـ API
 */
export async function fetchDatasetMetadata(datasetId: string): Promise<DatasetMetadata | null> {
  const cacheKey = getCacheKey(datasetId, 'meta');

  // Check cache first
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug(`📦 Metadata cache hit for ${datasetId}`);
      return JSON.parse(cached);
    }
  } catch {
    // Cache miss, continue to fetch
  }

  try {
    logger.info(`🌐 Fetching metadata for dataset: ${datasetId}`);

    const data = await fetchWithRetry<DatasetMetadata>(
      `${API_BASE}/datasets?version=-1&dataset=${datasetId}`
    );

    if (data && Object.keys(data).length > 0) {
      // Cache the metadata
      await cacheSet(cacheKey, JSON.stringify(data), CACHE_TTL_METADATA);
      return data;
    }

    return null;
  } catch (error) {
    logger.error(`❌ Failed to fetch metadata for ${datasetId}:`, error);
    return null;
  }
}

/**
 * جلب resources (روابط التحميل) للـ Dataset
 */
export async function fetchDatasetResources(datasetId: string): Promise<DatasetResource[]> {
  try {
    const data = await fetchWithRetry<{ resources?: DatasetResource[] }>(
      `${API_BASE}/datasets/resources?version=-1&dataset=${datasetId}`
    );

    return data?.resources || [];
  } catch (error) {
    logger.error(`❌ Failed to fetch resources for ${datasetId}:`, error);
    return [];
  }
}

/**
 * جلب بيانات CSV من رابط
 * يستخدم headers تشبه Browser لتجاوز WAF
 */
async function fetchCSVData(url: string): Promise<Record<string, unknown>[]> {
  try {
    // Encode URL properly to handle spaces
    const encodedUrl = encodeURI(url);

    const response = await axios.get(encodedUrl, {
      responseType: 'text',
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Accept-Language': 'ar,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://open.data.gov.sa/',
        'Origin': 'https://open.data.gov.sa',
      },
    });

    return new Promise((resolve, reject) => {
      Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true, // Auto-convert numbers
        complete: (results) => {
          resolve(results.data as Record<string, unknown>[]);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  } catch (error) {
    logger.error(`❌ Failed to fetch CSV from ${url}:`, error);
    throw error;
  }
}

/**
 * جلب البيانات الفعلية للـ Dataset (On-Demand)
 * هذه الدالة الرئيسية - تُستدعى عند فتح Chart Builder أو عرض البيانات
 */
export async function getDatasetData(
  datasetId: string,
  options: {
    limit?: number;
    offset?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<DatasetData | null> {
  const { limit, offset = 0, forceRefresh = false } = options;
  const cacheKey = getCacheKey(datasetId, 'data');

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`📦 Data cache hit for ${datasetId}`);
        const data = JSON.parse(cached) as DatasetData;

        // Apply pagination if requested
        if (limit) {
          data.records = data.records.slice(offset, offset + limit);
        }

        return { ...data, source: 'cache' };
      }
    } catch {
      // Cache miss, continue to fetch
    }
  }

  try {
    logger.info(`🌐 Fetching data on-demand for dataset: ${datasetId}`);

    // 1. Get resources list
    const resources = await fetchDatasetResources(datasetId);

    // 2. Find CSV resource
    const csvResource = resources.find(
      (r) => r.format?.toLowerCase() === 'csv' || r.downloadUrl?.endsWith('.csv')
    );

    if (!csvResource?.downloadUrl) {
      logger.warn(`⚠️ No CSV resource found for dataset ${datasetId}`);
      return null;
    }

    // 3. Fetch CSV data
    const records = await fetchCSVData(csvResource.downloadUrl);

    if (records.length === 0) {
      return null;
    }

    // 4. Extract columns
    const columns = Object.keys(records[0]);

    // 5. Create result
    const result: DatasetData = {
      id: datasetId,
      records: records,
      columns,
      totalRecords: records.length,
      fetchedAt: new Date().toISOString(),
      source: 'api',
    };

    // 6. Cache the full data
    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL);

    logger.info(`✅ Fetched ${records.length} records for dataset ${datasetId}`);

    // 7. Apply pagination if requested
    if (limit) {
      result.records = result.records.slice(offset, offset + limit);
    }

    return result;
  } catch (error) {
    logger.error(`❌ Failed to fetch data for ${datasetId}:`, error);
    return null;
  }
}

/**
 * جلب preview (أول 10 سجلات) للـ Dataset
 * للعرض السريع في القوائم
 */
export async function getDatasetPreview(
  datasetId: string,
  previewCount: number = 10
): Promise<DatasetData | null> {
  return getDatasetData(datasetId, { limit: previewCount });
}

/**
 * جلب إحصائيات سريعة عن Dataset
 */
export async function getDatasetStats(datasetId: string): Promise<{
  totalRecords: number;
  columns: string[];
  lastFetched: string | null;
} | null> {
  const cacheKey = getCacheKey(datasetId, 'data');

  try {
    // Try to get from cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as DatasetData;
      return {
        totalRecords: data.totalRecords,
        columns: data.columns,
        lastFetched: data.fetchedAt,
      };
    }

    // If not cached, fetch metadata only (lighter)
    const metadata = await fetchDatasetMetadata(datasetId);
    if (!metadata) return null;

    // Get resources to find record count
    const resources = await fetchDatasetResources(datasetId);
    const csvResource = resources.find(r => r.format?.toLowerCase() === 'csv');

    return {
      totalRecords: 0, // Unknown without fetching
      columns: [], // Unknown without fetching
      lastFetched: null,
    };
  } catch (error) {
    logger.error(`❌ Failed to get stats for ${datasetId}:`, error);
    return null;
  }
}

/**
 * مسح cache لـ Dataset معين
 */
export async function clearDatasetCache(datasetId: string): Promise<void> {
  const dataKey = getCacheKey(datasetId, 'data');
  const metaKey = getCacheKey(datasetId, 'meta');

  try {
    const { cacheDel } = await import('./cache.js');
    await cacheDel(dataKey);
    await cacheDel(metaKey);
    logger.info(`🗑️ Cleared cache for dataset ${datasetId}`);
  } catch (error) {
    logger.error(`❌ Failed to clear cache for ${datasetId}:`, error);
  }
}

/**
 * جلب بيانات متعددة Datasets بالتوازي
 */
export async function getMultipleDatasetsData(
  datasetIds: string[],
  options: { limit?: number } = {}
): Promise<Map<string, DatasetData | null>> {
  const results = new Map<string, DatasetData | null>();

  // Fetch in parallel (max 5 concurrent)
  const batchSize = 5;
  for (let i = 0; i < datasetIds.length; i += batchSize) {
    const batch = datasetIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const data = await getDatasetData(id, options);
        return { id, data };
      })
    );

    batchResults.forEach(({ id, data }) => {
      results.set(id, data);
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════

export default {
  fetchDatasetMetadata,
  fetchDatasetResources,
  getDatasetData,
  getDatasetPreview,
  getDatasetStats,
  clearDatasetCache,
  getMultipleDatasetsData,
};
