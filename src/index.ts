import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './services/database.js';
import { connectRedis, disconnectRedis } from './services/cache.js';
import { initializeScheduler } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('🚀 Starting Investor Radar API...');

    // Connect to database
    await connectDatabase();

    // Connect to Redis (optional - will continue without it)
    await connectRedis();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`✅ Server running on port ${config.port}`);
      logger.info(`📍 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 API: http://localhost:${config.port}/api`);

      // Initialize scheduled jobs
      if (config.nodeEnv === 'production') {
        initializeScheduler();
      } else {
        logger.info('⏭️ Skipping scheduler in development mode');
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        await disconnectDatabase();
        await disconnectRedis();

        logger.info('All connections closed. Exiting.');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
