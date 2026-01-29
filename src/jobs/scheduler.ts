import cron from 'node-cron';
import { syncAllDatasets } from '../services/saudiDataSync.js';
import { analyzeDatasets, generateDailySummary } from '../services/aiAnalysis.js';
import { generateMarketReport, createGeneratedContent } from '../services/contentGeneration.js';
import { prisma } from '../services/database.js';
import { logger } from '../utils/logger.js';

// Job status tracking
const jobStatus = {
  fullSync: { running: false, lastRun: null as Date | null, lastResult: null as string | null },
  quickCheck: { running: false, lastRun: null as Date | null },
  aiAnalysis: { running: false, lastRun: null as Date | null, signalsGenerated: 0 },
  contentGen: { running: false, lastRun: null as Date | null, contentGenerated: 0 },
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

// Initialize all scheduled jobs
export function initializeScheduler() {
  logger.info('🕐 Initializing job scheduler...');

  scheduleFullSync();
  scheduleQuickCheck();
  scheduleAIAnalysis();
  scheduleContentGeneration();
  scheduleCacheRefresh();

  logger.info('✅ All jobs scheduled');
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

export default {
  initializeScheduler,
  getJobStatus,
  triggerFullSync,
  triggerAIAnalysis,
  triggerContentGeneration,
};
