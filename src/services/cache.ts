import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function connectRedis(): Promise<void> {
  if (!config.redisUrl) {
    logger.warn('⚠️ REDIS_URL not configured, caching disabled');
    return;
  }

  try {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Disable retry limit for Upstash
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 10) {
          logger.warn('⚠️ Redis max retries reached, disabling cache');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      reconnectOnError(err) {
        // Only reconnect on specific errors
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    redis.on('error', (err) => {
      // Don't log every error to avoid spam
      if (!err.message.includes('MaxRetriesPerRequest')) {
        logger.error(`Redis error: ${err.message}`);
      }
    });

    redis.on('close', () => {
      logger.warn('⚠️ Redis connection closed');
    });

    // Test connection with timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
    ]);

    if (pingResult === 'PONG') {
      logger.info('✅ Redis ping successful');
    }
  } catch (error) {
    logger.warn('⚠️ Redis connection failed, caching disabled');
    redis = null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    logger.info('Redis disconnected');
  }
}

// Cache utilities
const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;

  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  if (!redis) return;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error(`Cache set error for key ${key}:`, error);
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (error) {
    logger.error(`Cache delete error for key ${key}:`, error);
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error(`Cache delete pattern error for ${pattern}:`, error);
  }
}

// Cache keys
export const CacheKeys = {
  datasets: 'datasets:all',
  dataset: (id: string) => `dataset:${id}`,
  datasetData: (id: string) => `dataset:${id}:data`,
  signals: 'signals:latest',
  signal: (id: string) => `signal:${id}`,
  content: 'content:feed',
  contentItem: (id: string) => `content:${id}`,
  syncStatus: 'sync:status',
  user: (id: string) => `user:${id}`,
} as const;

export default {
  getRedis,
  connectRedis,
  disconnectRedis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  CacheKeys
};
