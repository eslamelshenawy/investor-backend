import axios from 'axios';
import Papa from 'papaparse';
import crypto from 'crypto';
import { prisma } from './database.js';
import { cacheDel, CacheKeys } from './cache.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Known datasets from saudi-open-data-sync config
const KNOWN_DATASETS = [
  { id: '1e7e8621-fd39-42fb-b78f-3c50b0be4f2e', name: 'المؤشر العقاري للمناطق', category: 'عقارات' },
  { id: '0e0d56bc-c8fe-44cd-bbc9-9fc3f6651799', name: 'القرارات التنفيذية', category: 'قانونية' },
  { id: '2b13bef4-8c0d-40d3-b071-00bd089fb610', name: 'العمليات العقارية - تعديل صك', category: 'عقارات' },
  { id: '8fc9e19e-ed3a-4c8a-a768-58d9d04814f5', name: 'تسجيل ملكية عقار', category: 'عقارات' },
  { id: '66e8cee3-0495-4d78-bbad-00654e63aec8', name: 'نسب التملك العقاري - النساء', category: 'عقارات' },
  { id: '79998ff6-63b6-436e-9703-0430b440f3e6', name: 'الوكالات - صندوق التنمية العقارية', category: 'تمويل' },
  { id: '2746ab4f-0700-425f-9b5c-618944a8cada', name: 'نسب التملك العقاري - الرجال', category: 'عقارات' },
  { id: '5948497a-d84f-45a4-944c-50c59cff9629', name: 'الصفقات العقارية', category: 'عقارات' },
  { id: '6d54ae82-7736-4ccf-b662-31844233f5b5', name: 'نسبة ثقة المستفيدين ببرامج الدعم', category: 'إحصائيات' },
  { id: '38ef9473-f5f4-4fbf-83a7-1a4bf0c7ccec', name: 'مزادات العقارات', category: 'عقارات' },
  { id: '2a265aaf-fd1d-4aab-808e-74d8a3088594', name: 'مؤشرات صفقات البيع - مكة المكرمة', category: 'عقارات' },
  { id: 'ea90c3d0-cb8d-4c34-9892-ea0aa35ad9a3', name: 'الإقامة المميزة', category: 'استثمار' },
  { id: '43f82be8-7298-48fb-840d-eb176e51abc9', name: 'أنواع عقود الوساطة العقارية', category: 'عقارات' },
  { id: '3d44d00e-5aa6-4937-981d-bd0548606109', name: 'المبيعات العقارية إلكتروني', category: 'عقارات' },
  { id: 'b748181e-4c9f-4521-8144-1f48f7cb945c', name: 'مؤشرات صفقات البيع - الرياض', category: 'عقارات' },
  { id: '40fd0d4e-76e1-4fb2-afd3-42a56698e5af', name: 'تفاصيل المزادات', category: 'عقارات' },
  { id: 'b22e5e7c-2183-4115-bcd3-d6b955f24137', name: 'المستفيدين من الحلول التمويلية', category: 'تمويل' },
  { id: 'ad218919-2014-4917-a85d-d4ec1a43c050', name: 'الصفقات العقارية الربع الثاني', category: 'عقارات' },
  { id: 'e6e5bd44-95d5-4381-98c0-fa2b8c938b8b', name: 'المستفيدين من برامج الدعم السكني', category: 'تمويل' },
  { id: 'ba7b4224-da7d-4419-bbd3-1c6f586da49e', name: 'الدعم الشهري - صندوق التنمية', category: 'تمويل' },
];

const API_BASE = config.saudiDataApi;
const REQUEST_DELAY = 1000; // 1 second between requests

interface DatasetMeta {
  id: string;
  title: string;
  titleAr: string;
  description?: string;
  descriptionAr?: string;
  resources?: { id: string; format: string; url: string }[];
}

export interface SyncResult {
  datasetId: string;
  success: boolean;
  recordsCount: number;
  newRecords: number;
  updatedRecords: number;
  error?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashRecord(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('md5').update(str).digest('hex');
}

async function fetchDatasetMeta(datasetId: string): Promise<DatasetMeta | null> {
  try {
    const response = await axios.get(`${API_BASE}/3/action/package_show`, {
      params: { id: datasetId },
      headers: {
        'User-Agent': 'InvestorRadar/1.0',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    if (response.data?.success && response.data?.result) {
      const result = response.data.result;
      return {
        id: result.id,
        title: result.title || result.name,
        titleAr: result.title_ar || result.title || result.name,
        description: result.notes,
        descriptionAr: result.notes_ar || result.notes,
        resources: result.resources?.map((r: { id: string; format: string; url: string }) => ({
          id: r.id,
          format: r.format,
          url: r.url,
        })),
      };
    }

    return null;
  } catch (error) {
    logger.error(`Failed to fetch metadata for dataset ${datasetId}:`, error);
    return null;
  }
}

async function fetchCSVData(url: string): Promise<Record<string, unknown>[]> {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 60000,
      headers: {
        'User-Agent': 'InvestorRadar/1.0',
      },
    });

    return new Promise((resolve, reject) => {
      Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data as Record<string, unknown>[]);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  } catch (error) {
    logger.error(`Failed to fetch CSV from ${url}:`, error);
    throw error;
  }
}

async function syncDataset(
  externalId: string,
  name: string,
  category: string
): Promise<SyncResult> {
  const startTime = Date.now();
  let recordsCount = 0;
  let newRecords = 0;
  let updatedRecords = 0;

  try {
    // Update status to syncing
    let dataset = await prisma.dataset.findUnique({
      where: { externalId },
    });

    if (!dataset) {
      // Create new dataset
      dataset = await prisma.dataset.create({
        data: {
          externalId,
          name,
          nameAr: name,
          category,
          syncStatus: 'SYNCING',
        },
      });
    } else {
      await prisma.dataset.update({
        where: { id: dataset.id },
        data: { syncStatus: 'SYNCING' },
      });
    }

    // Fetch metadata
    const meta = await fetchDatasetMeta(externalId);

    if (meta) {
      await prisma.dataset.update({
        where: { id: dataset.id },
        data: {
          name: meta.title,
          nameAr: meta.titleAr,
          description: meta.description,
          descriptionAr: meta.descriptionAr,
        },
      });

      // Find CSV resource
      const csvResource = meta.resources?.find(
        (r) => r.format?.toLowerCase() === 'csv'
      );

      if (csvResource?.url) {
        // Fetch CSV data
        const records = await fetchCSVData(csvResource.url);
        recordsCount = records.length;

        if (records.length > 0) {
          // Get columns from first record
          const columns = Object.keys(records[0]);

          // Process records
          for (const record of records) {
            const hash = hashRecord(record);

            try {
              await prisma.dataRecord.upsert({
                where: {
                  datasetId_hash: {
                    datasetId: dataset.id,
                    hash,
                  },
                },
                create: {
                  datasetId: dataset.id,
                  data: JSON.stringify(record),
                  hash,
                },
                update: {
                  data: JSON.stringify(record),
                },
              });
              newRecords++;
            } catch {
              // Record might already exist, count as update
              updatedRecords++;
            }
          }

          // Update dataset with column info and preview
          await prisma.dataset.update({
            where: { id: dataset.id },
            data: {
              columns: JSON.stringify(columns),
              dataPreview: JSON.stringify(records.slice(0, 5)),
              recordCount: recordsCount,
              syncStatus: 'SUCCESS',
              lastSyncAt: new Date(),
              syncError: null,
            },
          });
        }
      }
    }

    // Mark as success
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        syncStatus: 'SUCCESS',
        lastSyncAt: new Date(),
        syncError: null,
      },
    });

    // Clear cache
    await cacheDel(CacheKeys.datasets);
    await cacheDel(CacheKeys.dataset(dataset.id));

    // Log sync
    await prisma.syncLog.create({
      data: {
        datasetId: dataset.id,
        jobType: 'dataset_sync',
        status: 'SUCCESS',
        recordsCount,
        newRecords,
        updatedRecords,
        duration: Date.now() - startTime,
      },
    });

    logger.info(`✅ Synced dataset: ${name} (${recordsCount} records)`);

    return {
      datasetId: externalId,
      success: true,
      recordsCount,
      newRecords,
      updatedRecords,
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

    // Log failure
    await prisma.syncLog.create({
      data: {
        jobType: 'dataset_sync',
        status: 'FAILED',
        error: errorMessage,
        duration: Date.now() - startTime,
      },
    });

    logger.error(`❌ Failed to sync dataset ${name}: ${errorMessage}`);

    return {
      datasetId: externalId,
      success: false,
      recordsCount: 0,
      newRecords: 0,
      updatedRecords: 0,
      error: errorMessage,
    };
  }
}

export async function syncAllDatasets(): Promise<{
  total: number;
  success: number;
  failed: number;
  results: SyncResult[];
}> {
  logger.info('🔄 Starting full data sync...');
  const startTime = Date.now();

  const results: SyncResult[] = [];
  let success = 0;
  let failed = 0;

  for (const dataset of KNOWN_DATASETS) {
    const result = await syncDataset(dataset.id, dataset.name, dataset.category);
    results.push(result);

    if (result.success) {
      success++;
    } else {
      failed++;
    }

    // Delay between requests to avoid rate limiting
    await delay(REQUEST_DELAY);
  }

  const duration = Date.now() - startTime;
  logger.info(
    `✅ Sync complete: ${success}/${KNOWN_DATASETS.length} successful in ${Math.round(duration / 1000)}s`
  );

  // Log overall sync
  await prisma.syncLog.create({
    data: {
      jobType: 'full_sync',
      status: failed === 0 ? 'SUCCESS' : 'FAILED',
      recordsCount: results.reduce((acc, r) => acc + r.recordsCount, 0),
      newRecords: results.reduce((acc, r) => acc + r.newRecords, 0),
      duration,
      metadata: JSON.stringify({ success, failed, total: KNOWN_DATASETS.length }),
    },
  });

  return {
    total: KNOWN_DATASETS.length,
    success,
    failed,
    results,
  };
}

export async function syncSingleDataset(externalId: string): Promise<SyncResult> {
  const known = KNOWN_DATASETS.find((d) => d.id === externalId);
  const name = known?.name || 'Unknown Dataset';
  const category = known?.category || 'أخرى';

  return syncDataset(externalId, name, category);
}

export default {
  syncAllDatasets,
  syncSingleDataset,
  KNOWN_DATASETS,
};
