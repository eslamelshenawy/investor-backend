import { Request, Response } from 'express';
import { findNewDatasets, addNewDatasets, getDiscoveryStats } from '../services/discovery.js';
import { syncAllDatasets, syncSingleDataset } from '../services/saudiDataSync.js';
import { success, error } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * اكتشاف Datasets جديدة
 * GET /api/discovery/discover
 */
export async function discover(req: Request, res: Response) {
  try {
    logger.info('🔍 Starting dataset discovery...');
    const result = await findNewDatasets();

    return success(res, {
      message: `تم اكتشاف ${result.newIds.length} dataset جديدة`,
      data: result,
    });
  } catch (err) {
    logger.error('Discovery failed:', err);
    return error(res, 'فشل اكتشاف الـ Datasets', 500);
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
      return error(res, 'يجب توفير قائمة datasetIds', 400);
    }

    const added = await addNewDatasets(datasetIds);

    return success(res, {
      message: `تم إضافة ${added} dataset جديدة`,
      added,
    });
  } catch (err) {
    logger.error('Add datasets failed:', err);
    return error(res, 'فشل إضافة الـ Datasets', 500);
  }
}

/**
 * إحصائيات الاكتشاف
 * GET /api/discovery/stats
 */
export async function stats(req: Request, res: Response) {
  try {
    const statistics = await getDiscoveryStats();

    return success(res, {
      message: 'إحصائيات الاكتشاف',
      data: statistics,
    });
  } catch (err) {
    logger.error('Get stats failed:', err);
    return error(res, 'فشل جلب الإحصائيات', 500);
  }
}

/**
 * اكتشاف ومزامنة - كل العملية
 * POST /api/discovery/discover-and-sync
 */
export async function discoverAndSync(req: Request, res: Response) {
  try {
    // Step 1: Discover new datasets
    logger.info('🔍 Step 1: Discovering new datasets...');
    const discoveryResult = await findNewDatasets();

    // Step 2: Add new datasets if found
    if (discoveryResult.newIds.length > 0) {
      logger.info(`➕ Step 2: Adding ${discoveryResult.newIds.length} new datasets...`);
      await addNewDatasets(discoveryResult.newIds);
    }

    // Step 3: Sync all datasets
    logger.info('🔄 Step 3: Syncing all datasets...');
    const syncResult = await syncAllDatasets();

    return success(res, {
      message: 'تم الاكتشاف والمزامنة بنجاح',
      discovery: {
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
    return error(res, 'فشل الاكتشاف والمزامنة', 500);
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

    return success(res, {
      message: `تم مزامنة ${result.success}/${result.total} dataset`,
      data: result,
    });
  } catch (err) {
    logger.error('Sync all failed:', err);
    return error(res, 'فشل المزامنة', 500);
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
      return error(res, 'يجب توفير datasetId', 400);
    }

    logger.info(`🔄 Syncing dataset: ${datasetId}`);
    const result = await syncSingleDataset(datasetId);

    if (result.success) {
      return success(res, {
        message: `تم مزامنة الـ dataset بنجاح`,
        data: result,
      });
    } else {
      return error(res, result.error || 'فشل المزامنة', 500);
    }
  } catch (err) {
    logger.error('Sync one failed:', err);
    return error(res, 'فشل المزامنة', 500);
  }
}

export default {
  discover,
  addDatasets,
  stats,
  discoverAndSync,
  syncAll,
  syncOne,
};
