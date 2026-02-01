import cron from 'node-cron';
import { syncAllDatasets } from '../services/saudiDataSync.js';
import { syncAllDatasets as syncFromPortal } from '../services/datasetSync.js';
import { analyzeDatasets, generateDailySummary } from '../services/aiAnalysis.js';
import { generateMarketReport, createGeneratedContent } from '../services/contentGeneration.js';
import { findNewDatasets, addNewDatasets, SAUDI_DATA_CATEGORIES } from '../services/discovery.js';
import { preFetchTopDatasets } from '../services/dataPreFetch.js';
import { prisma } from '../services/database.js';
import { logger } from '../utils/logger.js';

// Job status tracking
const jobStatus = {
  fullSync: { running: false, lastRun: null as Date | null, lastResult: null as string | null },
  portalSync: { running: false, lastRun: null as Date | null, totalSynced: 0, newDatasets: 0 },
  quickCheck: { running: false, lastRun: null as Date | null },
  aiAnalysis: { running: false, lastRun: null as Date | null, signalsGenerated: 0 },
  contentGen: { running: false, lastRun: null as Date | null, contentGenerated: 0 },
  discovery: { running: false, lastRun: null as Date | null, newFound: 0 },
  fullDiscovery: { running: false, lastRun: null as Date | null, newFound: 0, categoriesScanned: 0 },
  preFetch: { running: false, lastRun: null as Date | null, success: 0, failed: 0 },
};

// Full data sync - every 6 hours (0 */6 * * *)
export function scheduleFullSync() {
  cron.schedule('0 */6 * * *', async () => {
    if (jobStatus.fullSync.running) {
      logger.warn('Full sync already running, skipping...');
      return;
    }

    jobStatus.fullSync.running = true;
    logger.info('⏰ Scheduled: Starting full data sync');

    try {
      const result = await syncAllDatasets();
      jobStatus.fullSync.lastResult = `${result.success}/${result.total} datasets`;
      logger.info(`⏰ Full sync completed: ${result.success}/${result.total} datasets`);
    } catch (error) {
      logger.error('⏰ Full sync failed:', error);
      jobStatus.fullSync.lastResult = 'Failed';
    } finally {
      jobStatus.fullSync.running = false;
      jobStatus.fullSync.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Full data sync (every 6 hours)');
}

// Portal Sync - Daily at 3 AM (0 3 * * *)
// Uses Browserless to fetch ALL datasets from Saudi Open Data Portal
export function schedulePortalSync() {
  cron.schedule('0 3 * * *', async () => {
    if (jobStatus.portalSync.running) {
      logger.warn('Portal sync already running, skipping...');
      return;
    }

    jobStatus.portalSync.running = true;
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('⏰ Scheduled: Portal sync starting (Browserless)');
    logger.info('═══════════════════════════════════════════════════════');

    try {
      const result = await syncFromPortal();
      jobStatus.portalSync.totalSynced = result.totalSynced;
      jobStatus.portalSync.newDatasets = result.newDatasets;
      logger.info(`⏰ Portal sync completed: ${result.totalSynced} synced, ${result.newDatasets} new`);
    } catch (error) {
      logger.error('⏰ Portal sync failed:', error);
    } finally {
      jobStatus.portalSync.running = false;
      jobStatus.portalSync.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Portal sync (daily at 3 AM - uses Browserless)');
}

// Quick check - every hour (0 * * * *)
export function scheduleQuickCheck() {
  cron.schedule('0 * * * *', async () => {
    if (jobStatus.quickCheck.running) {
      logger.warn('Quick check already running, skipping...');
      return;
    }

    jobStatus.quickCheck.running = true;
    logger.info('⏰ Scheduled: Quick check starting');

    try {
      // Check for expired signals and deactivate them
      const expiredSignals = await prisma.signal.updateMany({
        where: {
          isActive: true,
          expiresAt: { lt: new Date() },
        },
        data: { isActive: false },
      });

      if (expiredSignals.count > 0) {
        logger.info(`⏰ Deactivated ${expiredSignals.count} expired signals`);
      }

      logger.info('⏰ Quick check completed');
    } catch (error) {
      logger.error('⏰ Quick check failed:', error);
    } finally {
      jobStatus.quickCheck.running = false;
      jobStatus.quickCheck.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Quick check (every hour)');
}

// AI Analysis - every 6 hours (30 */6 * * *)
export function scheduleAIAnalysis() {
  cron.schedule('30 */6 * * *', async () => {
    if (jobStatus.aiAnalysis.running) {
      logger.warn('AI analysis already running, skipping...');
      return;
    }

    jobStatus.aiAnalysis.running = true;
    logger.info('⏰ Scheduled: AI analysis starting');

    try {
      // Analyze datasets and generate signals
      const result = await analyzeDatasets();

      if (result) {
        jobStatus.aiAnalysis.signalsGenerated = result.signals.length;
        logger.info(`⏰ AI analysis completed: ${result.signals.length} signals generated`);

        // Generate daily summary
        const summary = await generateDailySummary();
        if (summary) {
          logger.info('⏰ Daily summary generated');
        }
      } else {
        logger.info('⏰ AI analysis completed: No new signals');
      }
    } catch (error) {
      logger.error('⏰ AI analysis failed:', error);
    } finally {
      jobStatus.aiAnalysis.running = false;
      jobStatus.aiAnalysis.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: AI Analysis (every 6 hours, offset 30min)');
}

// Content Generation - daily at 6 AM (0 6 * * *)
export function scheduleContentGeneration() {
  cron.schedule('0 6 * * *', async () => {
    if (jobStatus.contentGen.running) {
      logger.warn('Content generation already running, skipping...');
      return;
    }

    jobStatus.contentGen.running = true;
    logger.info('⏰ Scheduled: Content generation starting');

    try {
      let contentCount = 0;

      // 1. Generate daily market report
      const report = await generateMarketReport();
      if (report) {
        await createGeneratedContent('REPORT', report);
        contentCount++;
        logger.info('⏰ Market report generated');
      }

      // 2. Generate articles from recent high-impact signals
      const recentSignals = await prisma.signal.findMany({
        where: {
          isActive: true,
          impactScore: { gte: 75 },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { impactScore: 'desc' },
        take: 3,
      });

      // Note: Article generation from signals would go here
      // Skipping for now to avoid API rate limits

      jobStatus.contentGen.contentGenerated = contentCount;
      logger.info(`⏰ Content generation completed: ${contentCount} items created`);
    } catch (error) {
      logger.error('⏰ Content generation failed:', error);
    } finally {
      jobStatus.contentGen.running = false;
      jobStatus.contentGen.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Content generation (daily at 6 AM)');
}

// Cache refresh - every 30 minutes (*/30 * * * *)
export function scheduleCacheRefresh() {
  cron.schedule('*/30 * * * *', async () => {
    logger.info('⏰ Scheduled: Cache refresh');
    // Cache is automatically refreshed on access, this is just a placeholder
  });

  logger.info('📅 Scheduled: Cache refresh (every 30 minutes)');
}

// Data Pre-Fetch - every 2 hours (0 */2 * * *)
// جلب البيانات مسبقاً وتخزينها في Redis
export function scheduleDataPreFetch() {
  cron.schedule('0 */2 * * *', async () => {
    if (jobStatus.preFetch.running) {
      logger.warn('Pre-fetch already running, skipping...');
      return;
    }

    jobStatus.preFetch.running = true;
    logger.info('⏰ Scheduled: Data pre-fetch starting');

    try {
      // Pre-fetch top 100 datasets
      const result = await preFetchTopDatasets(100);

      jobStatus.preFetch.success = result.success;
      jobStatus.preFetch.failed = result.failed;

      logger.info(`⏰ Pre-fetch completed: ${result.success} success, ${result.failed} failed`);
    } catch (error) {
      logger.error('⏰ Pre-fetch failed:', error);
    } finally {
      jobStatus.preFetch.running = false;
      jobStatus.preFetch.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Data pre-fetch (every 2 hours)');
}

// Quick Discovery - weekly on Sunday at 3 AM (0 3 * * 0)
export function scheduleDiscovery() {
  cron.schedule('0 3 * * 0', async () => {
    if (jobStatus.discovery.running) {
      logger.warn('Discovery already running, skipping...');
      return;
    }

    jobStatus.discovery.running = true;
    logger.info('⏰ Scheduled: Quick dataset discovery starting');

    try {
      // Quick discover (main page only)
      const result = await findNewDatasets(false);

      if (result.newIds.length > 0) {
        // Add new datasets to database
        await addNewDatasets(result.newIds);
        jobStatus.discovery.newFound = result.newIds.length;
        logger.info(`⏰ Quick discovery completed: ${result.newIds.length} new datasets found and added`);

        // Trigger sync for new datasets
        logger.info('⏰ Triggering sync for new datasets...');
        await syncAllDatasets();
      } else {
        jobStatus.discovery.newFound = 0;
        logger.info('⏰ Quick discovery completed: No new datasets found');
      }
    } catch (error) {
      logger.error('⏰ Quick discovery failed:', error);
    } finally {
      jobStatus.discovery.running = false;
      jobStatus.discovery.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: Quick dataset discovery (weekly on Sunday at 3 AM)');
}

// Full Discovery - monthly on 1st at 2 AM (0 2 1 * *)
// Scans ALL categories to find ALL 15,500+ datasets
export function scheduleFullDiscovery() {
  cron.schedule('0 2 1 * *', async () => {
    if (jobStatus.fullDiscovery.running || jobStatus.discovery.running) {
      logger.warn('Discovery already running, skipping full discovery...');
      return;
    }

    jobStatus.fullDiscovery.running = true;
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('⏰ Scheduled: FULL dataset discovery starting');
    logger.info(`📊 Scanning ${SAUDI_DATA_CATEGORIES.length} categories`);
    logger.info('⚠️ This may take several hours!');
    logger.info('═══════════════════════════════════════════════════════');

    try {
      // Full discover (all categories)
      const result = await findNewDatasets(true);

      jobStatus.fullDiscovery.categoriesScanned = SAUDI_DATA_CATEGORIES.length;

      if (result.newIds.length > 0) {
        // Add new datasets to database
        await addNewDatasets(result.newIds);
        jobStatus.fullDiscovery.newFound = result.newIds.length;
        logger.info(`⏰ Full discovery completed: ${result.newIds.length} new datasets found and added`);

        // Trigger sync for new datasets
        logger.info('⏰ Triggering sync for new datasets...');
        await syncAllDatasets();
      } else {
        jobStatus.fullDiscovery.newFound = 0;
        logger.info('⏰ Full discovery completed: No new datasets found');
      }

      logger.info('═══════════════════════════════════════════════════════');
      logger.info('✅ Full discovery job completed');
      logger.info('═══════════════════════════════════════════════════════');
    } catch (error) {
      logger.error('⏰ Full discovery failed:', error);
    } finally {
      jobStatus.fullDiscovery.running = false;
      jobStatus.fullDiscovery.lastRun = new Date();
    }
  });

  logger.info('📅 Scheduled: FULL dataset discovery (monthly on 1st at 2 AM - scans all categories)');
}

// Initialize all scheduled jobs
export function initializeScheduler() {
  logger.info('🕐 Initializing job scheduler...');

  scheduleFullSync();
  schedulePortalSync();
  scheduleQuickCheck();
  scheduleAIAnalysis();
  scheduleContentGeneration();
  scheduleCacheRefresh();
  scheduleDiscovery();
  scheduleFullDiscovery();
  scheduleDataPreFetch();

  logger.info('✅ All jobs scheduled');
  logger.info(`📊 Available categories for full discovery: ${SAUDI_DATA_CATEGORIES.length}`);
}

// Get job status
export function getJobStatus() {
  return jobStatus;
}

// Manual trigger functions
export async function triggerFullSync() {
  if (jobStatus.fullSync.running) {
    throw new Error('Full sync already running');
  }

  jobStatus.fullSync.running = true;

  try {
    const result = await syncAllDatasets();
    jobStatus.fullSync.lastResult = `${result.success}/${result.total}`;
    return result;
  } finally {
    jobStatus.fullSync.running = false;
    jobStatus.fullSync.lastRun = new Date();
  }
}

// Trigger portal sync manually (uses Browserless)
export async function triggerPortalSync() {
  if (jobStatus.portalSync.running) {
    throw new Error('Portal sync already running');
  }

  jobStatus.portalSync.running = true;

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🔍 Manual: Portal sync starting (Browserless)');
    logger.info('═══════════════════════════════════════════════════════');

    const result = await syncFromPortal();
    jobStatus.portalSync.totalSynced = result.totalSynced;
    jobStatus.portalSync.newDatasets = result.newDatasets;
    return result;
  } finally {
    jobStatus.portalSync.running = false;
    jobStatus.portalSync.lastRun = new Date();
  }
}

export async function triggerAIAnalysis() {
  if (jobStatus.aiAnalysis.running) {
    throw new Error('AI analysis already running');
  }

  jobStatus.aiAnalysis.running = true;

  try {
    const result = await analyzeDatasets();
    if (result) {
      jobStatus.aiAnalysis.signalsGenerated = result.signals.length;
    }
    return result;
  } finally {
    jobStatus.aiAnalysis.running = false;
    jobStatus.aiAnalysis.lastRun = new Date();
  }
}

export async function triggerContentGeneration() {
  if (jobStatus.contentGen.running) {
    throw new Error('Content generation already running');
  }

  jobStatus.contentGen.running = true;

  try {
    const report = await generateMarketReport();
    if (report) {
      const saved = await createGeneratedContent('REPORT', report);
      jobStatus.contentGen.contentGenerated = 1;
      return saved;
    }
    return null;
  } finally {
    jobStatus.contentGen.running = false;
    jobStatus.contentGen.lastRun = new Date();
  }
}

export async function triggerDiscovery() {
  if (jobStatus.discovery.running) {
    throw new Error('Discovery already running');
  }

  jobStatus.discovery.running = true;

  try {
    const result = await findNewDatasets(false);

    if (result.newIds.length > 0) {
      await addNewDatasets(result.newIds);
      jobStatus.discovery.newFound = result.newIds.length;
    }

    return result;
  } finally {
    jobStatus.discovery.running = false;
    jobStatus.discovery.lastRun = new Date();
  }
}

// Trigger full discovery manually (all categories)
export async function triggerFullDiscovery() {
  if (jobStatus.fullDiscovery.running || jobStatus.discovery.running) {
    throw new Error('Discovery already running');
  }

  jobStatus.fullDiscovery.running = true;

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🔍 Manual: FULL dataset discovery starting');
    logger.info(`📊 Scanning ${SAUDI_DATA_CATEGORIES.length} categories`);
    logger.info('═══════════════════════════════════════════════════════');

    const result = await findNewDatasets(true);

    jobStatus.fullDiscovery.categoriesScanned = SAUDI_DATA_CATEGORIES.length;

    if (result.newIds.length > 0) {
      await addNewDatasets(result.newIds);
      jobStatus.fullDiscovery.newFound = result.newIds.length;
    }

    return {
      ...result,
      categoriesScanned: SAUDI_DATA_CATEGORIES.length,
    };
  } finally {
    jobStatus.fullDiscovery.running = false;
    jobStatus.fullDiscovery.lastRun = new Date();
  }
}

// Trigger pre-fetch manually
export async function triggerPreFetch(limit: number = 100) {
  if (jobStatus.preFetch.running) {
    throw new Error('Pre-fetch already running');
  }

  jobStatus.preFetch.running = true;

  try {
    const result = await preFetchTopDatasets(limit);
    jobStatus.preFetch.success = result.success;
    jobStatus.preFetch.failed = result.failed;
    return result;
  } finally {
    jobStatus.preFetch.running = false;
    jobStatus.preFetch.lastRun = new Date();
  }
}

export default {
  initializeScheduler,
  getJobStatus,
  triggerFullSync,
  triggerPortalSync,
  triggerAIAnalysis,
  triggerContentGeneration,
  triggerDiscovery,
  triggerFullDiscovery,
  triggerPreFetch,
};
