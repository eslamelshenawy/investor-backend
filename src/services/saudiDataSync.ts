/**
 * خدمة مزامنة البيانات السعودية - Metadata Only Version
 *
 * ⚠️ هذه النسخة المحسنة تخزن METADATA فقط (لتوفير Storage)
 * البيانات الفعلية تُجلب On-Demand من onDemandData.ts
 */

import axios from 'axios';
import { prisma } from './database.js';
import { cacheDel, CacheKeys } from './cache.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const API_BASE = 'https://open.data.gov.sa/data/api';
const REQUEST_DELAY = 500; // 500ms between requests
const REQUEST_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface DatasetApiResponse {
  id?: string;
  titleEn?: string;
  titleAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  providerNameEn?: string;
  providerNameAr?: string;
  organizationId?: string;
  updateFrequency?: string;
  categories?: { titleAr?: string; titleEn?: string }[];
  tags?: { name?: string }[];
  createdAt?: string;
  updatedAt?: string;
  resourcesCount?: number;
}

interface ResourceInfo {
  format?: string;
  downloadUrl?: string;
  name?: string;
}

export interface SyncResult {
  datasetId: string;
  success: boolean;
  message: string;
  metadata?: {
    name: string;
    category: string;
    provider: string;
    recordCount: number;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDatasetInfo(datasetId: string): Promise<DatasetApiResponse | null> {
  try {
    const response = await axios.get(
      `${API_BASE}/datasets?version=-1&dataset=${datasetId}`,
      {
        timeout: REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'InvestorRadar/2.0',
          'Accept': 'application/json',
        },
      }
    );

    if (response.data && Object.keys(response.data).length > 0) {
      return response.data;
    }
    return null;
  } catch (error) {
    logger.error(`Failed to fetch info for ${datasetId}:`, error);
    return null;
  }
}

async function fetchDatasetResources(datasetId: string): Promise<ResourceInfo[]> {
  try {
    const response = await axios.get(
      `${API_BASE}/datasets/resources?version=-1&dataset=${datasetId}`,
      {
        timeout: REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'InvestorRadar/2.0',
          'Accept': 'application/json',
        },
      }
    );

    return response.data?.resources || [];
  } catch {
    return [];
  }
}

async function getRecordCountFromCSV(url: string): Promise<number> {
  try {
    // Just do a HEAD request or fetch first few KB to estimate
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 10000,
      headers: { Range: 'bytes=0-50000' }, // First 50KB
    });

    // Count newlines as approximate record count
    const lines = response.data.split('\n').length - 1; // -1 for header

    // If we got truncated, estimate based on content length
    const contentLength = response.headers['content-length'];
    if (contentLength && response.data.length < parseInt(contentLength)) {
      const ratio = parseInt(contentLength) / response.data.length;
      return Math.floor(lines * ratio);
    }

    return lines;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main Sync Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * مزامنة Metadata لـ Dataset واحد (بدون تخزين البيانات الفعلية)
 */
export async function syncDatasetMetadata(externalId: string): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    logger.info(`📋 Syncing metadata for: ${externalId}`);

    // 1. Fetch dataset info from API
    const info = await fetchDatasetInfo(externalId);

    if (!info) {
      return {
        datasetId: externalId,
        success: false,
        message: 'Dataset not found in API',
        error: 'NOT_FOUND',
      };
    }

    // 2. Get resources to find CSV and estimate record count
    const resources = await fetchDatasetResources(externalId);
    const csvResource = resources.find(
      (r) => r.format?.toLowerCase() === 'csv' || r.downloadUrl?.endsWith('.csv')
    );

    let recordCount = 0;
    let columns: string[] = [];

    if (csvResource?.downloadUrl) {
      // Just estimate record count, don't download full file
      recordCount = await getRecordCountFromCSV(csvResource.downloadUrl);
    }

    // 3. Extract category
    const category = info.categories?.[0]?.titleAr || 'أخرى';

    // 4. Upsert dataset (metadata only!)
    const dataset = await prisma.dataset.upsert({
      where: { externalId },
      create: {
        externalId,
        name: info.titleEn || `Dataset ${externalId.substring(0, 8)}`,
        nameAr: info.titleAr || `مجموعة بيانات ${externalId.substring(0, 8)}`,
        description: info.descriptionEn || '',
        descriptionAr: info.descriptionAr || '',
        category,
        source: 'open.data.gov.sa',
        sourceUrl: `https://open.data.gov.sa/ar/datasets/view/${externalId}`,
        recordCount,
        columns: JSON.stringify(columns),
        dataPreview: '[]', // Empty - data fetched on-demand
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date(),
      },
      update: {
        name: info.titleEn || undefined,
        nameAr: info.titleAr || undefined,
        description: info.descriptionEn || undefined,
        descriptionAr: info.descriptionAr || undefined,
        category,
        recordCount,
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date(),
        syncError: null,
      },
    });

    // 5. Clear cache
    await cacheDel(CacheKeys.datasets);
    await cacheDel(CacheKeys.dataset(dataset.id));

    // 6. Log sync
    await prisma.syncLog.create({
      data: {
        datasetId: dataset.id,
        jobType: 'metadata_sync',
        status: 'SUCCESS',
        recordsCount: recordCount,
        newRecords: 0, // We don't store records anymore
        updatedRecords: 0,
        duration: Date.now() - startTime,
        metadata: JSON.stringify({
          provider: info.providerNameAr,
          category,
          estimatedRecords: recordCount,
        }),
      },
    });

    logger.info(`✅ Synced metadata: ${info.titleAr} (~${recordCount} records)`);

    return {
      datasetId: externalId,
      success: true,
      message: 'Metadata synced successfully',
      metadata: {
        name: info.titleAr || '',
        category,
        provider: info.providerNameAr || '',
        recordCount,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as failed
    await prisma.dataset.updateMany({
      where: { externalId },
      data: {
        syncStatus: 'FAILED',
        syncError: errorMessage,
      },
    });

    logger.error(`❌ Failed to sync metadata for ${externalId}: ${errorMessage}`);

    return {
      datasetId: externalId,
      success: false,
      message: 'Sync failed',
      error: errorMessage,
    };
  }
}

/**
 * مزامنة Metadata لكل الـ Datasets في قاعدة البيانات
 */
export async function syncAllDatasets(): Promise<{
  total: number;
  success: number;
  failed: number;
  results: SyncResult[];
}> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('🔄 Starting metadata sync for all datasets');
  logger.info('═══════════════════════════════════════════════════════');

  const startTime = Date.now();

  // Get all datasets from database
  const datasets = await prisma.dataset.findMany({
    select: { externalId: true, nameAr: true },
    orderBy: { createdAt: 'asc' },
  });

  logger.info(`📊 Found ${datasets.length} datasets to sync`);

  const results: SyncResult[] = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i];

    // Progress log
    if ((i + 1) % 10 === 0 || i === datasets.length - 1) {
      logger.info(`📈 Progress: ${i + 1}/${datasets.length}`);
    }

    const result = await syncDatasetMetadata(dataset.externalId);
    results.push(result);

    if (result.success) {
      success++;
    } else {
      failed++;
    }

    // Delay between requests
    await delay(REQUEST_DELAY);
  }

  const duration = Date.now() - startTime;

  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`✅ Sync complete: ${success}/${datasets.length} in ${Math.round(duration / 1000)}s`);
  logger.info('═══════════════════════════════════════════════════════');

  // Log overall sync
  await prisma.syncLog.create({
    data: {
      jobType: 'full_metadata_sync',
      status: failed === 0 ? 'SUCCESS' : 'PARTIAL',
      recordsCount: datasets.length,
      newRecords: success,
      updatedRecords: 0,
      duration,
      metadata: JSON.stringify({
        total: datasets.length,
        success,
        failed,
        type: 'metadata_only',
      }),
    },
  });

  return {
    total: datasets.length,
    success,
    failed,
    results,
  };
}

/**
 * مزامنة Dataset واحد بالـ ID
 */
export async function syncSingleDataset(externalId: string): Promise<SyncResult> {
  return syncDatasetMetadata(externalId);
}

/**
 * إضافة Datasets جديدة وعمل sync لها
 */
export async function addAndSyncDatasets(
  datasetIds: string[]
): Promise<{
  added: number;
  synced: number;
  failed: number;
}> {
  logger.info(`📝 Adding and syncing ${datasetIds.length} datasets...`);

  let added = 0;
  let synced = 0;
  let failed = 0;

  for (const externalId of datasetIds) {
    // Check if exists
    const existing = await prisma.dataset.findUnique({
      where: { externalId },
    });

    if (!existing) {
      // Create placeholder
      await prisma.dataset.create({
        data: {
          externalId,
          name: `Dataset ${externalId.substring(0, 8)}`,
          nameAr: `مجموعة بيانات ${externalId.substring(0, 8)}`,
          category: 'أخرى',
          syncStatus: 'PENDING',
        },
      });
      added++;
    }

    // Sync metadata
    const result = await syncDatasetMetadata(externalId);
    if (result.success) {
      synced++;
    } else {
      failed++;
    }

    await delay(REQUEST_DELAY);
  }

  logger.info(`✅ Added: ${added}, Synced: ${synced}, Failed: ${failed}`);

  return { added, synced, failed };
}

// ═══════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════

export default {
  syncDatasetMetadata,
  syncAllDatasets,
  syncSingleDataset,
  addAndSyncDatasets,
};
