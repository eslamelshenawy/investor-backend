/**
 * Dataset Sync Service - Syncs all datasets from Saudi Open Data Portal
 *
 * Uses Browserless.io to get session cookies, then fetches via API
 * Designed to run daily as a cron job
 */

import puppeteer from 'puppeteer-core';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io?token=';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';
const BASE_URL = 'https://open.data.gov.sa';
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface SyncResult {
  success: boolean;
  totalSynced: number;
  newDatasets: number;
  updatedDatasets: number;
  errors: string[];
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

interface DatasetItem {
  datasetID?: string;
  datasetId?: string;
  uuid?: string;
  id?: string;
  titleAr?: string;
  titleEn?: string;
  title?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  description?: string;
  categories?: Array<{ titleAr?: string; titleEn?: string }>;
  publisherNameAr?: string;
  publisherNameEn?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get session cookies using Browserless
 */
async function getSessionCookies(): Promise<string | null> {
  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN not configured');
    return null;
  }

  let browser;
  try {
    logger.info('🔄 Connecting to Browserless...');

    browser = await puppeteer.connect({
      browserWSEndpoint: `${BROWSERLESS_URL}${BROWSERLESS_TOKEN}`,
    });

    const page = await browser.newPage();

    // Set up as real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ar,en;q=0.9',
    });

    logger.info('🌐 Navigating to Saudi Open Data Portal...');

    // Visit the portal to get cookies
    await page.goto(`${BASE_URL}/ar/datasets`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for page to fully load
    await delay(3000);

    // Extract cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    logger.info(`✅ Got ${cookies.length} cookies`);

    await page.close();

    return cookieString;
  } catch (error) {
    logger.error('❌ Failed to get cookies:', error);
    return null;
  } finally {
    if (browser) {
      browser.disconnect();
    }
  }
}

/**
 * Fetch a page of datasets from API
 */
async function fetchDatasetPage(
  pageNum: number,
  cookies: string
): Promise<{ items: DatasetItem[]; totalPages: number } | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/datasets/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookies,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: `${BASE_URL}/ar/datasets`,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        pageNumber: pageNum,
        pageSize: PAGE_SIZE,
        lang: 'ar',
        sortDir: 'desc',
        sortKey: 'createdAt',
      }),
    });

    if (!response.ok) {
      logger.error(`❌ API returned ${response.status} for page ${pageNum}`);
      return null;
    }

    const data = await response.json();

    return {
      items: data.data?.items || data.items || [],
      totalPages: data.data?.totalPages || data.totalPages || 0,
    };
  } catch (error) {
    logger.error(`❌ Failed to fetch page ${pageNum}:`, error);
    return null;
  }
}

/**
 * Save dataset to database
 */
async function saveDataset(item: DatasetItem): Promise<{ isNew: boolean }> {
  const datasetId = item.datasetID || item.datasetId || item.uuid || item.id;

  if (!datasetId) {
    throw new Error('No dataset ID found');
  }

  const categoryName =
    item.categories?.[0]?.titleAr || item.categories?.[0]?.titleEn || 'عام';

  const name = item.titleAr || item.titleEn || item.title || datasetId;
  const nameEn = item.titleEn || item.title || '';
  const description = item.descriptionAr || item.descriptionEn || item.description || '';
  const descriptionEn = item.descriptionEn || item.description || '';
  const source = item.publisherNameAr || item.publisherNameEn || 'open.data.gov.sa';
  const sourceUrl = `${BASE_URL}/ar/datasets/view/${datasetId}`;

  // Check if exists
  const existing = await prisma.dataset.findFirst({
    where: { externalId: datasetId },
    select: { id: true },
  });

  if (existing) {
    // Update
    await prisma.dataset.update({
      where: { id: existing.id },
      data: {
        name: nameEn || name,
        nameAr: name,
        description: descriptionEn || description,
        descriptionAr: description,
        category: categoryName,
        source,
        sourceUrl,
        updatedAt: new Date(),
      },
    });
    return { isNew: false };
  } else {
    // Create
    await prisma.dataset.create({
      data: {
        externalId: datasetId,
        name: nameEn || name,
        nameAr: name,
        description: descriptionEn || description,
        descriptionAr: description,
        category: categoryName,
        source,
        sourceUrl,
        syncStatus: 'PENDING',
        isActive: true,
      },
    });
    return { isNew: true };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main Sync Function
// ═══════════════════════════════════════════════════════════════════

/**
 * Sync all datasets from Saudi Open Data Portal
 */
export async function syncAllDatasets(): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let totalSynced = 0;
  let newDatasets = 0;
  let updatedDatasets = 0;

  logger.info('═══════════════════════════════════════════════════════');
  logger.info('🚀 Starting Full Dataset Sync');
  logger.info(`📅 Started at: ${startedAt.toISOString()}`);
  logger.info('═══════════════════════════════════════════════════════');

  try {
    // 1. Get session cookies
    let cookies = await getSessionCookies();

    if (!cookies) {
      throw new Error('Failed to get session cookies');
    }

    // 2. Fetch first page to get total
    logger.info('📊 Fetching first page to get total count...');
    const firstPage = await fetchDatasetPage(1, cookies);

    if (!firstPage) {
      throw new Error('Failed to fetch first page');
    }

    const totalPages = firstPage.totalPages;
    logger.info(`📊 Total pages: ${totalPages}`);

    // 3. Process all pages
    let currentPage = 1;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const COOKIE_REFRESH_INTERVAL = 15;

    while (currentPage <= totalPages) {
      // Refresh cookies periodically
      if (currentPage > 1 && currentPage % COOKIE_REFRESH_INTERVAL === 0) {
        logger.info('🔄 Refreshing session cookies...');
        const newCookies = await getSessionCookies();
        if (newCookies) {
          cookies = newCookies;
          logger.info('✅ Cookies refreshed');
        }
      }

      // Fetch page with retry
      let page = null;
      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        page = await fetchDatasetPage(currentPage, cookies);
        if (page && page.items.length > 0) {
          break;
        }
        if (retry < MAX_RETRIES - 1) {
          logger.warn(`⚠️ Retry ${retry + 1} for page ${currentPage}...`);
          await delay(2000);

          // Try refreshing cookies on retry
          const newCookies = await getSessionCookies();
          if (newCookies) {
            cookies = newCookies;
          }
        }
      }

      if (!page || page.items.length === 0) {
        consecutiveErrors++;
        errors.push(`Failed to fetch page ${currentPage}`);
        logger.error(`❌ Failed to fetch page ${currentPage} after ${MAX_RETRIES} retries`);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(`❌ Too many consecutive errors, stopping sync`);
          break;
        }

        currentPage++;
        continue;
      }

      // Reset error counter on success
      consecutiveErrors = 0;

      // Process items
      for (const item of page.items) {
        try {
          const result = await saveDataset(item);
          totalSynced++;
          if (result.isNew) {
            newDatasets++;
          } else {
            updatedDatasets++;
          }
        } catch (error) {
          const msg = `Failed to save dataset: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(msg);
        }
      }

      logger.info(
        `📄 Page ${currentPage}/${totalPages}: saved ${page.items.length} datasets (total: ${totalSynced})`
      );

      currentPage++;

      // Small delay between pages
      await delay(500);
    }

    const completedAt = new Date();
    const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;

    // Log to sync_logs table
    await prisma.syncLog.create({
      data: {
        jobType: 'FULL_DATASET_SYNC',
        status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        recordsCount: totalSynced,
        newRecords: newDatasets,
        duration: Math.round(duration),
        error: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
        startedAt,
        completedAt,
      },
    });

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('✅ Dataset Sync Complete!');
    logger.info(`📊 Total synced: ${totalSynced}`);
    logger.info(`🆕 New datasets: ${newDatasets}`);
    logger.info(`🔄 Updated datasets: ${updatedDatasets}`);
    logger.info(`⏱️ Duration: ${duration.toFixed(1)} seconds`);
    logger.info(`❌ Errors: ${errors.length}`);
    logger.info('═══════════════════════════════════════════════════════');

    return {
      success: true,
      totalSynced,
      newDatasets,
      updatedDatasets,
      errors,
      duration,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const completedAt = new Date();
    const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    logger.error(`❌ Sync failed: ${errorMsg}`);

    // Log failure
    await prisma.syncLog.create({
      data: {
        jobType: 'FULL_DATASET_SYNC',
        status: 'FAILED',
        recordsCount: totalSynced,
        newRecords: newDatasets,
        duration: Math.round(duration),
        error: errorMsg,
        startedAt,
        completedAt,
      },
    });

    return {
      success: false,
      totalSynced,
      newDatasets,
      updatedDatasets,
      errors: [...errors, errorMsg],
      duration,
      startedAt,
      completedAt,
    };
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  lastSync: Date | null;
  totalDatasets: number;
  latestLog: unknown;
}> {
  const [count, latestLog] = await Promise.all([
    prisma.dataset.count(),
    prisma.syncLog.findFirst({
      where: { jobType: 'FULL_DATASET_SYNC' },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  return {
    lastSync: latestLog?.completedAt || null,
    totalDatasets: count,
    latestLog,
  };
}

export default {
  syncAllDatasets,
  getSyncStatus,
};
