/**
 * Manual sync script - Run with: npx tsx src/jobs/runSync.ts
 */

import { syncAllDatasets } from '../services/saudiDataSync.js';
import { connectDatabase, disconnectDatabase } from '../services/database.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('🚀 Starting manual data sync...');

  try {
    await connectDatabase();

    const result = await syncAllDatasets();

    logger.info('📊 Sync Results:');
    logger.info(`   Total: ${result.total}`);
    logger.info(`   Success: ${result.success}`);
    logger.info(`   Failed: ${result.failed}`);

    if (result.failed > 0) {
      logger.info('\n❌ Failed datasets:');
      result.results
        .filter(r => !r.success)
        .forEach(r => logger.info(`   - ${r.datasetId}: ${r.error}`));
    }

  } catch (error) {
    logger.error('Sync failed:', error);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
