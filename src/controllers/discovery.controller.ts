import { Request, Response } from 'express';
import {
  findNewDatasets,
  addNewDatasets,
  getDiscoveryStats,
  discoverAllDatasets,
  getAvailableCategories,
  SAUDI_DATA_CATEGORIES,
} from '../services/discovery.js';
import { syncAllDatasets, syncSingleDataset } from '../services/saudiDataSync.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * اكتشاف سريع - الصفحة الرئيسية فقط
 * GET /api/discovery/discover
 */
export async function discover(req: Request, res: Response) {
  try {
    logger.info('🔍 Starting quick dataset discovery...');
    const result = await findNewDatasets(false);

    return sendSuccess(res, {
      message: `تم اكتشاف ${result.newIds.length} dataset جديدة`,
      data: result,
    });
  } catch (err) {
    logger.error('Discovery failed:', err);
    return sendError(res, 'Discovery failed', 'فشل اكتشاف الـ Datasets', 500);
  }
}

/**
 * اكتشاف شامل - كل الأقسام (يستغرق وقت طويل)
 * GET /api/discovery/discover-all
 */
export async function discoverAll(req: Request, res: Response) {
  try {
    logger.info('🔍 Starting FULL dataset discovery (all categories)...');
    logger.info(`📊 Will scan ${SAUDI_DATA_CATEGORIES.length} categories`);

    const result = await findNewDatasets(true);

    return sendSuccess(res, {
      message: `تم اكتشاف ${result.newIds.length} dataset جديدة من ${result.total} إجمالي`,
      data: {
        ...result,
        categoriesScanned: SAUDI_DATA_CATEGORIES.length,
      },
    });
  } catch (err) {
    logger.error('Full discovery failed:', err);
    return sendError(res, 'Full discovery failed', 'فشل الاكتشاف الشامل', 500);
  }
}

/**
 * الحصول على قائمة الأقسام المتاحة
 * GET /api/discovery/categories
 */
export async function getCategories(req: Request, res: Response) {
  try {
    const categories = getAvailableCategories();

    return sendSuccess(res, {
      message: `${categories.length} قسم متاح`,
      data: {
        count: categories.length,
        categories,
      },
    });
  } catch (err) {
    logger.error('Get categories failed:', err);
    return sendError(res, 'Get categories failed', 'فشل جلب الأقسام', 500);
  }
}

/**
 * إضافة Datasets جديدة يدوياً
 * POST /api/discovery/add
 * Body: { datasetIds: string[] }
 */
export async function addDatasets(req: Request, res: Response) {
  try {
    const { datasetIds } = req.body;

    if (!datasetIds || !Array.isArray(datasetIds) || datasetIds.length === 0) {
      return sendError(res, 'datasetIds required', 'يجب توفير قائمة datasetIds', 400);
    }

    logger.info(`📝 Adding ${datasetIds.length} datasets manually...`);
    const added = await addNewDatasets(datasetIds);

    return sendSuccess(res, {
      message: `تم إضافة ${added} dataset جديدة`,
      added,
      requested: datasetIds.length,
    });
  } catch (err) {
    logger.error('Add datasets failed:', err);
    return sendError(res, 'Add datasets failed', 'فشل إضافة الـ Datasets', 500);
  }
}

/**
 * إحصائيات الاكتشاف
 * GET /api/discovery/stats
 */
export async function stats(req: Request, res: Response) {
  try {
    const statistics = await getDiscoveryStats();

    return sendSuccess(res, {
      message: 'إحصائيات الاكتشاف',
      data: {
        ...statistics,
        availableCategories: SAUDI_DATA_CATEGORIES.length,
        platformInfo: {
          name: 'منصة البيانات المفتوحة السعودية',
          url: 'https://open.data.gov.sa',
          estimatedTotal: '15,500+',
        },
      },
    });
  } catch (err) {
    logger.error('Get stats failed:', err);
    return sendError(res, 'Get stats failed', 'فشل جلب الإحصائيات', 500);
  }
}

/**
 * اكتشاف سريع ومزامنة
 * POST /api/discovery/discover-and-sync
 */
export async function discoverAndSync(req: Request, res: Response) {
  try {
    const { fullDiscovery = false } = req.body;

    // Step 1: Discover new datasets
    logger.info(`🔍 Step 1: Discovering datasets (${fullDiscovery ? 'full' : 'quick'})...`);
    const discoveryResult = await findNewDatasets(fullDiscovery);

    // Step 2: Add new datasets if found
    if (discoveryResult.newIds.length > 0) {
      logger.info(`➕ Step 2: Adding ${discoveryResult.newIds.length} new datasets...`);
      await addNewDatasets(discoveryResult.newIds);
    }

    // Step 3: Sync all datasets
    logger.info('🔄 Step 3: Syncing all datasets...');
    const syncResult = await syncAllDatasets();

    return sendSuccess(res, {
      message: 'تم الاكتشاف والمزامنة بنجاح',
      discovery: {
        mode: fullDiscovery ? 'full' : 'quick',
        total: discoveryResult.total,
        newFound: discoveryResult.newIds.length,
      },
      sync: {
        total: syncResult.total,
        success: syncResult.success,
        failed: syncResult.failed,
      },
    });
  } catch (err) {
    logger.error('Discover and sync failed:', err);
    return sendError(res, 'Discover and sync failed', 'فشل الاكتشاف والمزامنة', 500);
  }
}

/**
 * اكتشاف شامل ومزامنة - العملية الكاملة
 * POST /api/discovery/full-discover-and-sync
 * تحذير: قد يستغرق ساعات!
 */
export async function fullDiscoverAndSync(req: Request, res: Response) {
  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🚀 Starting FULL discovery and sync process');
    logger.info(`📊 Categories to scan: ${SAUDI_DATA_CATEGORIES.length}`);
    logger.info('⚠️ This may take several hours!');
    logger.info('═══════════════════════════════════════════════════════');

    // Step 1: Full discovery
    logger.info('🔍 Step 1: Full discovery (all categories)...');
    const discoveryResult = await findNewDatasets(true);

    // Step 2: Add all new datasets
    let addedCount = 0;
    if (discoveryResult.newIds.length > 0) {
      logger.info(`➕ Step 2: Adding ${discoveryResult.newIds.length} new datasets...`);
      addedCount = await addNewDatasets(discoveryResult.newIds);
    }

    // Step 3: Sync all
    logger.info('🔄 Step 3: Syncing all datasets...');
    const syncResult = await syncAllDatasets();

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('✅ FULL discovery and sync completed!');
    logger.info('═══════════════════════════════════════════════════════');

    return sendSuccess(res, {
      message: 'تم الاكتشاف الشامل والمزامنة بنجاح',
      discovery: {
        mode: 'full',
        categoriesScanned: SAUDI_DATA_CATEGORIES.length,
        totalFound: discoveryResult.total,
        newFound: discoveryResult.newIds.length,
        added: addedCount,
      },
      sync: {
        total: syncResult.total,
        success: syncResult.success,
        failed: syncResult.failed,
      },
    });
  } catch (err) {
    logger.error('Full discover and sync failed:', err);
    return sendError(res, 'Full discover and sync failed', 'فشل الاكتشاف الشامل والمزامنة', 500);
  }
}

/**
 * مزامنة كل الـ Datasets
 * POST /api/discovery/sync-all
 */
export async function syncAll(req: Request, res: Response) {
  try {
    logger.info('🔄 Starting full sync...');
    const result = await syncAllDatasets();

    return sendSuccess(res, {
      message: `تم مزامنة ${result.success}/${result.total} dataset`,
      data: result,
    });
  } catch (err) {
    logger.error('Sync all failed:', err);
    return sendError(res, 'Sync failed', 'فشل المزامنة', 500);
  }
}

/**
 * مزامنة dataset واحد
 * POST /api/discovery/sync/:datasetId
 */
export async function syncOne(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;

    if (!datasetId) {
      return sendError(res, 'datasetId required', 'يجب توفير datasetId', 400);
    }

    logger.info(`🔄 Syncing dataset: ${datasetId}`);
    const result = await syncSingleDataset(datasetId);

    if (result.success) {
      return sendSuccess(res, {
        message: `تم مزامنة الـ dataset بنجاح`,
        data: result,
      });
    } else {
      return sendError(res, result.error || 'Sync failed', 'فشل المزامنة', 500);
    }
  } catch (err) {
    logger.error('Sync one failed:', err);
    return sendError(res, 'Sync failed', 'فشل المزامنة', 500);
  }
}

export default {
  discover,
  discoverAll,
  getCategories,
  addDatasets,
  stats,
  discoverAndSync,
  fullDiscoverAndSync,
  syncAll,
  syncOne,
};
