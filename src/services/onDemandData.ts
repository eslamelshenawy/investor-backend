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
import prisma from '../config/database.js';

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
// Types - Datasets List
// ═══════════════════════════════════════════════════════════════════

export interface DatasetListItem {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category?: string;
  organization?: string;
  recordCount?: number;
  updatedAt?: string;
  resources?: DatasetResource[];
}

export interface DatasetListResult {
  datasets: DatasetListItem[];
  total: number;
  page: number;
  hasMore: boolean;
  source: 'api' | 'cache';
  fetchedAt: string;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const API_BASE = 'https://open.data.gov.sa/data/api';
const CKAN_BASE = 'https://open.data.gov.sa/api/3/action';
const CACHE_TTL = 3600; // 1 hour cache
const CACHE_TTL_METADATA = 86400; // 24 hours for metadata
const CACHE_TTL_LIST = 21600; // 6 hours for datasets list
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
 * يستخدم DB أولاً ثم يجرب API كـ fallback
 */
export async function fetchDatasetResources(datasetId: string): Promise<DatasetResource[]> {
  // 1. Try database first (resources synced from sync script)
  try {
    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [{ id: datasetId }, { externalId: datasetId }],
      },
      select: { resources: true },
    });

    if (dataset?.resources && Array.isArray(dataset.resources) && dataset.resources.length > 0) {
      logger.info(`📦 Found ${dataset.resources.length} resources in DB for ${datasetId}`);
      return (dataset.resources as any[]).map((r: any) => ({
        id: r.id || '',
        name: r.name || 'Resource',
        format: r.format || '',
        downloadUrl: r.url || '',
      }));
    }
  } catch (error) {
    logger.warn(`⚠️ DB resource lookup failed for ${datasetId}:`, error);
  }

  // 2. Fallback to API
  try {
    logger.info(`🌐 Fetching resources from API for ${datasetId}`);
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
// Fetch Datasets List from CKAN API (البوابة الوطنية)
// ═══════════════════════════════════════════════════════════════════

/**
 * جلب قائمة الـ Datasets من CKAN API مباشرة
 * مع Cache في Redis لمدة 6 ساعات
 */
export async function fetchDatasetsList(options: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  forceRefresh?: boolean;
} = {}): Promise<DatasetListResult> {
  const { page = 1, limit = 100, search, category, forceRefresh = false } = options;
  const offset = (page - 1) * limit;

  // Cache key
  const cacheKey = `saudi:datasets:list:${page}:${limit}:${search || ''}:${category || ''}`;

  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`📦 Datasets list cache hit (page ${page})`);
        const data = JSON.parse(cached);
        return { ...data, source: 'cache' };
      }
    } catch {
      // Cache miss
    }
  }

  logger.info(`🌐 Fetching datasets list from Saudi API (page: ${page}, limit: ${limit})`);

  const allDatasets: DatasetListItem[] = [];

  try {
    // Build CKAN search query
    let searchQuery = `rows=${limit}&start=${offset}`;
    if (search) {
      searchQuery += `&q=${encodeURIComponent(search)}`;
    }
    if (category) {
      searchQuery += `&fq=groups:${encodeURIComponent(category)}`;
    }

    // CKAN package_search endpoint
    const url = `${CKAN_BASE}/package_search?${searchQuery}`;
    logger.info(`   🔗 Calling: ${url}`);

    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'ar,en;q=0.9',
        'Referer': 'https://open.data.gov.sa/',
      },
    });

    const data = response.data;

    // CKAN returns: { success: true, result: { results: [...], count: N } }
    if (data.success && data.result?.results) {
      const items = data.result.results;
      const totalCount = data.result.count || items.length;

      logger.info(`   ✅ Found ${items.length} datasets (total: ${totalCount})`);

      items.forEach((item: Record<string, unknown>) => {
        const dataset: DatasetListItem = {
          id: String(item.id || item.name),
          titleAr: String(item.title_ar || item.title || item.name || ''),
          titleEn: String(item.title_en || item.title || item.name || ''),
          descriptionAr: item.notes_ar ? String(item.notes_ar) : undefined,
          descriptionEn: item.notes_en || item.notes ? String(item.notes_en || item.notes) : undefined,
          category: Array.isArray(item.groups) && item.groups.length > 0
            ? String((item.groups[0] as Record<string, unknown>).title || (item.groups[0] as Record<string, unknown>).name)
            : undefined,
          organization: item.organization
            ? String((item.organization as Record<string, unknown>).title || (item.organization as Record<string, unknown>).name)
            : undefined,
          recordCount: item.num_resources ? Number(item.num_resources) : undefined,
          updatedAt: item.metadata_modified ? String(item.metadata_modified) : undefined,
          resources: Array.isArray(item.resources)
            ? (item.resources as Record<string, unknown>[]).map((r) => ({
                id: String(r.id || ''),
                name: String(r.name || r.description || ''),
                format: String(r.format || ''),
                downloadUrl: String(r.url || ''),
              }))
            : undefined,
        };

        if (dataset.id && (dataset.titleAr || dataset.titleEn)) {
          allDatasets.push(dataset);
        }
      });

      const result: DatasetListResult = {
        datasets: allDatasets,
        total: totalCount,
        page,
        hasMore: offset + allDatasets.length < totalCount,
        source: 'api',
        fetchedAt: new Date().toISOString(),
      };

      // Cache the result
      await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_LIST);
      logger.info(`   💾 Cached ${allDatasets.length} datasets for ${CACHE_TTL_LIST}s`);

      return result;
    }

    logger.warn('   ⚠️ CKAN API returned unexpected format');
    return {
      datasets: [],
      total: 0,
      page,
      hasMore: false,
      source: 'api',
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`❌ Failed to fetch datasets list:`, error);

    // Return empty result on error
    return {
      datasets: [],
      total: 0,
      page,
      hasMore: false,
      source: 'api',
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * جلب كل الـ Datasets (مع pagination تلقائي)
 */
export async function fetchAllDatasets(
  onProgress?: (loaded: number) => void
): Promise<DatasetListItem[]> {
  const allDatasets: DatasetListItem[] = [];
  let page = 1;
  let hasMore = true;
  const limit = 100;

  // Check if we have full list in cache
  const fullCacheKey = 'saudi:datasets:all';
  try {
    const cached = await cacheGet(fullCacheKey);
    if (cached) {
      logger.info(`📦 Full datasets list cache hit`);
      return JSON.parse(cached);
    }
  } catch {
    // Cache miss
  }

  logger.info(`🚀 Fetching ALL datasets from Saudi API...`);

  while (hasMore && page <= 200) { // Max 200 pages = 20,000 datasets
    const result = await fetchDatasetsList({ page, limit });

    if (result.datasets.length === 0) {
      hasMore = false;
    } else {
      // Filter duplicates
      result.datasets.forEach((d) => {
        if (!allDatasets.find((existing) => existing.id === d.id)) {
          allDatasets.push(d);
        }
      });

      hasMore = result.hasMore;
      page++;

      if (onProgress) {
        onProgress(allDatasets.length);
      }

      logger.info(`   📊 Progress: ${allDatasets.length} datasets loaded (page ${page - 1})`);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Cache all results for 6 hours
  if (allDatasets.length > 0) {
    await cacheSet(fullCacheKey, JSON.stringify(allDatasets), CACHE_TTL_LIST);
    logger.info(`💾 Cached ${allDatasets.length} total datasets`);
  }

  return allDatasets;
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
  fetchDatasetsList,
  fetchAllDatasets,
};
