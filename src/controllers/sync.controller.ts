/**
 * Sync Controller - Handles dataset synchronization
 */

import { Request, Response, NextFunction } from 'express';
import { syncAllDatasets, getSyncStatus } from '../services/datasetSync.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

// Track if sync is currently running
let isSyncRunning = false;
let lastSyncStartTime: Date | null = null;

/**
 * Trigger manual sync (Admin only)
 */
export async function triggerSync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if sync is already running
    if (isSyncRunning) {
      sendError(
        res,
        'Sync is already running',
        'عملية المزامنة قيد التشغيل بالفعل',
        409
      );
      return;
    }

    // Check for admin key (simple auth for now)
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    const expectedKey = process.env.ADMIN_SYNC_KEY || 'investor-sync-2024';

    if (adminKey !== expectedKey) {
      sendError(res, 'Unauthorized', 'غير مصرح', 401);
      return;
    }

    logger.info('🚀 Manual sync triggered');

    // Start sync in background
    isSyncRunning = true;
    lastSyncStartTime = new Date();

    // Don't await - run in background
    syncAllDatasets()
      .then((result) => {
        logger.info(`✅ Background sync completed: ${result.totalSynced} datasets`);
        isSyncRunning = false;
      })
      .catch((error) => {
        logger.error('❌ Background sync failed:', error);
        isSyncRunning = false;
      });

    sendSuccess(res, {
      message: 'Sync started in background',
      messageAr: 'بدأت عملية المزامنة في الخلفية',
      startedAt: lastSyncStartTime.toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get sync status
 */
export async function getStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const status = await getSyncStatus();

    sendSuccess(res, {
      isRunning: isSyncRunning,
      currentSyncStartedAt: lastSyncStartTime?.toISOString() || null,
      lastCompletedSync: status.lastSync?.toISOString() || null,
      totalDatasets: status.totalDatasets,
      latestLog: status.latestLog,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cron endpoint - called by external cron service
 */
export async function cronSync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Verify cron secret
    const cronSecret = req.headers['x-cron-secret'] || req.query.cronSecret;
    const expectedSecret = process.env.CRON_SECRET || 'investor-cron-2024';

    if (cronSecret !== expectedSecret) {
      sendError(res, 'Unauthorized', 'غير مصرح', 401);
      return;
    }

    if (isSyncRunning) {
      sendSuccess(res, {
        message: 'Sync already running, skipping',
        messageAr: 'المزامنة قيد التشغيل، تم التخطي',
        skipped: true,
      });
      return;
    }

    logger.info('🕐 Cron sync triggered');

    isSyncRunning = true;
    lastSyncStartTime = new Date();

    // Run sync (await for cron to know result)
    const result = await syncAllDatasets();
    isSyncRunning = false;

    sendSuccess(res, {
      message: 'Sync completed',
      messageAr: 'اكتملت المزامنة',
      result: {
        success: result.success,
        totalSynced: result.totalSynced,
        newDatasets: result.newDatasets,
        updatedDatasets: result.updatedDatasets,
        duration: result.duration,
        errors: result.errors.length,
      },
    });
  } catch (error) {
    isSyncRunning = false;
    next(error);
  }
}

export default {
  triggerSync,
  getStatus,
  cronSync,
};
