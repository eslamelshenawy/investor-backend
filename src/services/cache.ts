import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function connectRedis(): Promise<void> {
  try {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });

    redis.on('error', (err) => {
      logger.error('❌ Redis error:', err);
    });

    // Test connection
    await redis.ping();
  } catch (error) {
    logger.warn('⚠️ Redis connection failed, caching disabled:', error);
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
