/**
 * خدمة جلب البيانات المسبق - Data Pre-Fetch Service
 *
 * تستخدم Browserless لجلب ملفات CSV من منصة البيانات السعودية
 * وتخزينها في Redis للوصول السريع
 */

import puppeteer from 'puppeteer-core';
import Papa from 'papaparse';
import { prisma } from './database.js';
import { cacheSet, cacheGet, CacheKeys } from './cache.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io?token=';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';
const API_BASE = 'https://open.data.gov.sa/data/api';

// Cache TTL - 24 hours for pre-fetched data
const CACHE_TTL = 86400;

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface DatasetResource {
  id: string;
  name: string;
  format: string;
  downloadUrl: string;
}

interface PreFetchResult {
  datasetId: string;
  success: boolean;
  recordCount: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * جلب resources للـ Dataset
 */
async function fetchResources(datasetId: string): Promise<DatasetResource[]> {
  try {
    const response = await fetch(
      `${API_BASE}/datasets/resources?version=-1&dataset=${datasetId}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data?.resources || [];
  } catch (error) {
    logger.error(`Failed to fetch resources for ${datasetId}:`, error);
    return [];
  }
}

/**
 * جلب CSV عبر Browserless
 */
async function fetchCSVViaBrowserless(url: string): Promise<string | null> {
  if (!BROWSERLESS_TOKEN) {
    logger.warn('BROWSERLESS_TOKEN not configured');
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${BROWSERLESS_URL}${BROWSERLESS_TOKEN}`,
    });

    const page = await browser.newPage();

    // Set headers to look like a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept': 'text/csv,text/plain,*/*',
      'Accept-Language': 'ar,en;q=0.9',
    });

    // Navigate to the CSV URL
    const response = await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    if (!response || !response.ok()) {
      logger.error(`Failed to load CSV: ${response?.status()}`);
      return null;
    }

    // Get the page content (CSV data)
    const content = await page.content();

    // Extract text from pre tag if wrapped
    const preMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      return preMatch[1];
    }

    // Try to get raw text
    const text = await page.evaluate(() => document.body.innerText);

    await page.close();
    return text;
  } catch (error) {
    logger.error(`Browserless fetch failed for ${url}:`, error);
    return null;
  } finally {
    if (browser) {
      browser.disconnect();
    }
  }
}

/**
 * تحويل CSV إلى JSON
 */
function parseCSV(csvContent: string): Record<string, unknown>[] {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        resolve(results.data as Record<string, unknown>[]);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  }) as unknown as Record<string, unknown>[];
}

// ═══════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * جلب وتخزين بيانات Dataset واحد
 */
export async function preFetchDataset(datasetId: string): Promise<PreFetchResult> {
  const cacheKey = `ondemand:data:${datasetId}`;

  try {
    logger.info(`📥 Pre-fetching dataset: ${datasetId}`);

    // 1. Get resources
    const resources = await fetchResources(datasetId);

    // 2. Find CSV resource
    const csvResource = resources.find(
      (r) => r.format?.toLowerCase() === 'csv' || r.downloadUrl?.endsWith('.csv')
    );

    if (!csvResource?.downloadUrl) {
      logger.warn(`No CSV resource for ${datasetId}`);
      return { datasetId, success: false, recordCount: 0, error: 'No CSV resource' };
    }

    // 3. Fetch CSV via Browserless
    const csvContent = await fetchCSVViaBrowserless(csvResource.downloadUrl);

    if (!csvContent) {
      return { datasetId, success: false, recordCount: 0, error: 'Failed to fetch CSV' };
    }

    // 4. Parse CSV
    const records = await parseCSV(csvContent);

    if (!records || records.length === 0) {
      return { datasetId, success: false, recordCount: 0, error: 'Empty CSV' };
    }

    // 5. Prepare data for cache
    const data = {
      id: datasetId,
      records: records,
      columns: Object.keys(records[0]),
      totalRecords: records.length,
      fetchedAt: new Date().toISOString(),
      source: 'prefetch',
    };

    // 6. Store in Redis
    await cacheSet(cacheKey, JSON.stringify(data), CACHE_TTL);

    // 7. Update database status
    await prisma.dataset.updateMany({
      where: { externalId: datasetId },
      data: {
        syncStatus: 'SUCCESS',
        recordCount: records.length,
        lastSyncAt: new Date(),
      },
    });

    logger.info(`✅ Pre-fetched ${datasetId}: ${records.length} records`);

    return { datasetId, success: true, recordCount: records.length };
  } catch (error) {
    logger.error(`❌ Pre-fetch failed for ${datasetId}:`, error);
    return {
      datasetId,
      success: false,
      recordCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * جلب بيانات أهم الـ Datasets
 */
export async function preFetchTopDatasets(limit: number = 50): Promise<{
  total: number;
  success: number;
  failed: number;
  results: PreFetchResult[];
}> {
  logger.info(`═══════════════════════════════════════════════════════`);
  logger.info(`📥 Starting pre-fetch for top ${limit} datasets`);
  logger.info(`═══════════════════════════════════════════════════════`);

  // Get top datasets (SUCCESS ones that need refresh, or PENDING ones)
  const datasets = await prisma.dataset.findMany({
    where: {
      isActive: true,
      syncStatus: { in: ['SUCCESS', 'PENDING'] },
    },
    orderBy: [
      { syncStatus: 'asc' }, // SUCCESS first
      { lastSyncAt: 'asc' }, // Oldest first
    ],
    take: limit,
    select: {
      id: true,
      externalId: true,
      nameAr: true,
    },
  });

  logger.info(`📊 Found ${datasets.length} datasets to pre-fetch`);

  const results: PreFetchResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  // Process in batches of 5
  const batchSize = 5;
  for (let i = 0; i < datasets.length; i += batchSize) {
    const batch = datasets.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((ds) => preFetchDataset(ds.externalId))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    logger.info(`📊 Progress: ${i + batch.length}/${datasets.length} (${successCount} success, ${failedCount} failed)`);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < datasets.length) {
      await delay(2000);
    }
  }

  logger.info(`═══════════════════════════════════════════════════════`);
  logger.info(`✅ Pre-fetch complete: ${successCount} success, ${failedCount} failed`);
  logger.info(`═══════════════════════════════════════════════════════`);

  return {
    total: datasets.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

/**
 * جلب البيانات من الـ Cache (سريع جداً)
 */
export async function getFromCache(datasetId: string): Promise<{
  records: Record<string, unknown>[];
  columns: string[];
  totalRecords: number;
  source: string;
} | null> {
  const cacheKey = `ondemand:data:${datasetId}`;

  try {
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      const data = JSON.parse(cached as unknown as string);
      return {
        records: data.records,
        columns: data.columns,
        totalRecords: data.totalRecords,
        source: 'cache',
      };
    }
  } catch (error) {
    logger.error(`Cache read error for ${datasetId}:`, error);
  }

  return null;
}

export default {
  preFetchDataset,
  preFetchTopDatasets,
  getFromCache,
};
