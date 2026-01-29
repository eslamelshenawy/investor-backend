import axios from 'axios';
import Papa from 'papaparse';
import crypto from 'crypto';
import { prisma } from './database.js';
import { cacheDel, CacheKeys } from './cache.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Known datasets from saudi-open-data-sync config - 54 datasets
const KNOWN_DATASETS = [
  // عقارات - Real Estate
  { id: '1e7e8621-fd39-42fb-b78f-3c50b0be4f2e', name: 'المؤشر العقاري للمناطق في عام 2018-2021', category: 'عقارات' },
  { id: '2b13bef4-8c0d-40d3-b071-00bd089fb610', name: 'العمليات العقارية - تعديل صك 2025 الربع الثالث', category: 'عقارات' },
  { id: '8fc9e19e-ed3a-4c8a-a768-58d9d04814f5', name: 'تسجيل ملكية عقار بدون صك 2025 الربع الثالث', category: 'عقارات' },
  { id: '66e8cee3-0495-4d78-bbad-00654e63aec8', name: 'نسب التملك العقاري - النساء 2025 الربع الثالث', category: 'عقارات' },
  { id: '2746ab4f-0700-425f-9b5c-618944a8cada', name: 'نسب التملك العقاري - الرجال 2025 الربع الثالث', category: 'عقارات' },
  { id: '5948497a-d84f-45a4-944c-50c59cff9629', name: 'الصفقات العقارية 2025 الربع الثالث', category: 'عقارات' },
  { id: '38ef9473-f5f4-4fbf-83a7-1a4bf0c7ccec', name: 'مزادات العقارات السنوية 2025', category: 'عقارات' },
  { id: '2a265aaf-fd1d-4aab-808e-74d8a3088594', name: 'مؤشرات صفقات البيع - مكة المكرمة الربع الثالث 2025', category: 'عقارات' },
  { id: '43f82be8-7298-48fb-840d-eb176e51abc9', name: 'أنواع عقود الوساطة العقارية', category: 'عقارات' },
  { id: '4a64b777-1db8-482d-b99a-5a0a76836d36', name: 'أنواع استخدامات العقارات للوساطة العقارية', category: 'عقارات' },
  { id: '3d44d00e-5aa6-4937-981d-bd0548606109', name: 'المبيعات العقارية إلكتروني 2025', category: 'عقارات' },
  { id: 'b748181e-4c9f-4521-8144-1f48f7cb945c', name: 'مؤشرات صفقات البيع - الرياض الربع الثالث 2025', category: 'عقارات' },
  { id: '40fd0d4e-76e1-4fb2-afd3-42a56698e5af', name: 'تفاصيل المزادات إلكتروني 2025', category: 'عقارات' },
  { id: 'cc856462-5d59-481c-8ceb-29007c2b5525', name: 'المبيعات العقارية هجين 2025', category: 'عقارات' },
  { id: 'c8ae6fea-4f68-436a-accc-2d83d14f0cd4', name: 'مؤشرات صفقات البيع - الرياض الربع الأول 2025', category: 'عقارات' },
  { id: '2c2a3203-0671-4692-b030-628001b80d46', name: 'نسب التملك العقاري - الرجال 2025 الربع الأول', category: 'عقارات' },
  { id: '30243301-2f50-4134-a967-a24dd5d9dfbf', name: 'أنواع المنتجات العقارية', category: 'عقارات' },
  { id: '68098400-520c-48d5-8d26-bd8855bf7572', name: 'مبيعات الأصول العقارية السنوية 2025', category: 'عقارات' },
  { id: '308744fe-60db-47f5-9ddb-691a51506a09', name: 'تفاصيل المزادات هجين 2025', category: 'عقارات' },
  { id: '526237a0-c089-4003-939f-05dd827da9d1', name: 'عدد المسجلين عينيا للعقارات حسب الجنس 2024', category: 'عقارات' },
  { id: 'ad218919-2014-4917-a85d-d4ec1a43c050', name: 'الصفقات العقارية 2025 الربع الثاني', category: 'عقارات' },
  { id: '3a3ea3cc-dbf3-4d69-99db-a5c2f0165ae6', name: 'الأصول الوقفية العقارية المشمولة بنظارة الهيئة العامة للأوقاف', category: 'عقارات' },

  // قانونية - Legal
  { id: '0e0d56bc-c8fe-44cd-bbc9-9fc3f6651799', name: 'القرارات التنفيذية - بيع عقار 2025 الربع الثالث', category: 'قانونية' },
  { id: '099d92d7-050f-494a-ba11-175e358bc121', name: 'القرارات التنفيذية - بيع عقار 2025 الربع الثاني', category: 'قانونية' },
  { id: '7645e1f8-aed3-4038-9f74-090d015a13d6', name: 'القرارات التنفيذية - بيع عقار 2025 الربع الأول', category: 'قانونية' },

  // تمويل - Financing
  { id: '79998ff6-63b6-436e-9703-0430b440f3e6', name: 'الوكالات - صندوق التنمية العقارية 2025 الربع الثالث', category: 'تمويل' },
  { id: 'e54350f5-4121-4007-a7d8-1938373d0bd1', name: 'الوكالات - صندوق التنمية العقارية 2025 الربع الثاني', category: 'تمويل' },
  { id: 'e8ed3887-59a5-4504-8316-e9cece8f2249', name: 'الوكالات - صندوق التنمية العقارية 2025 الربع الأول', category: 'تمويل' },
  { id: 'b22e5e7c-2183-4115-bcd3-d6b955f24137', name: 'المستفيدين من الحلول التمويلية حسب المناطق', category: 'تمويل' },
  { id: '0662ed73-d555-45e2-814a-898d368ab4ef', name: 'عدد عقود الانتفاع المنتهية بالتملك حسب السنة', category: 'تمويل' },
  { id: '6dfb5c0b-0557-485d-be98-a39ea9b2e387', name: 'خطة الشراء للإيجارات', category: 'تمويل' },
  { id: 'e6e5bd44-95d5-4381-98c0-fa2b8c938b8b', name: 'إجمالي المستفيدين من برامج الدعم السكني', category: 'تمويل' },
  { id: 'ba7b4224-da7d-4419-bbd3-1c6f586da49e', name: 'الدعم الشهري - صندوق التنمية العقارية', category: 'تمويل' },
  { id: '9396bbd8-4283-4485-ac2a-c6743b74980c', name: 'عدد عقود الرهن الميسر بشكل سنوي', category: 'تمويل' },
  { id: 'db0596fb-ff37-41a3-b6f2-cf15d7b724a4', name: 'متوسط أعمار المستفيدين من الحلول التمويلية', category: 'تمويل' },
  { id: 'b6dc46f4-9de0-4039-82f5-b5db3897883d', name: 'قروض الإقراض المباشر المغلقة', category: 'تمويل' },

  // إحصائيات - Statistics
  { id: '6d54ae82-7736-4ccf-b662-31844233f5b5', name: 'نسبة ثقة المستفيدين ببرامج الدعم السكني', category: 'إحصائيات' },
  { id: '932edccb-b985-4fd0-bca6-5badf9d14300', name: 'نسبة التوطين بصندوق التنمية العقارية', category: 'إحصائيات' },
  { id: 'c02f10db-06ef-4528-aabb-264f63d163c9', name: 'موظفي صندوق التنمية العقارية حسب الجنس', category: 'إحصائيات' },
  { id: '40892c84-c7ec-48c9-b89c-da6caf178e96', name: 'عدد المكالمات الصادرة والواردة لمراكز الاتصال', category: 'إحصائيات' },

  // استثمار - Investment
  { id: 'ea90c3d0-cb8d-4c34-9892-ea0aa35ad9a3', name: 'الإقامة المميزة حسب المنتج والفئة العمرية', category: 'استثمار' },
  { id: 'c3e2b0a2-06b2-4a73-bb77-1e57fcb35365', name: 'عدد المتقدمين للإقامة المميزة حسب المنتج', category: 'استثمار' },

  // Datasets مكتشفة جديدة (يناير 2026)
  { id: '224cc094-3db1-4ee9-ac82-13070b853b60', name: 'مكتشف جديد 1', category: 'أخرى' },
  { id: '2631f6c0-1b59-4968-ab3c-6d27c49584f4', name: 'مكتشف جديد 2', category: 'أخرى' },
  { id: 'b5b932af-7eef-4205-9999-9dd6ad05c724', name: 'مكتشف جديد 3', category: 'أخرى' },
  { id: '6cc4e48e-ac27-4bb5-91b3-2d853947c1fd', name: 'مكتشف جديد 4', category: 'أخرى' },
  { id: '64f6e1b8-1c10-48c6-bd31-556a9ffdf56e', name: 'مكتشف جديد 5', category: 'أخرى' },
  { id: '18857b15-b252-4f66-9c36-a7be7cb2400e', name: 'مكتشف جديد 6', category: 'أخرى' },
  { id: 'da2a46b0-92b6-4600-b44f-9e95f25b8029', name: 'مكتشف جديد 7', category: 'أخرى' },
  { id: '79f9deb1-ae46-41d6-a807-84232eccbff6', name: 'مكتشف جديد 8', category: 'أخرى' },
  { id: '9dc1bd09-7775-4352-a417-c1dc06205890', name: 'مكتشف جديد 9', category: 'أخرى' },
  { id: '11617318-70e9-418a-9da3-f7d527f5c42b', name: 'مكتشف جديد 10', category: 'أخرى' },
  { id: '5c82b344-4f21-4f28-bbae-1990b7f403cc', name: 'مكتشف جديد 11', category: 'أخرى' },
  { id: 'a6be2d0d-bb9b-440a-b8fd-02c03f526798', name: 'مكتشف جديد 12', category: 'أخرى' },
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
