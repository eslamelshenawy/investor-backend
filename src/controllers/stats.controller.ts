import { Request, Response } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { cacheGet, cacheSet } from '../services/cache.js';

const CACHE_TTL = 60; // 1 minute cache for fresh data

/**
 * Get REAL overview stats from database
 * No fallback - returns actual data only
 */
export const getOverviewStats = async (_req: Request, res: Response) => {
  try {
    // Try to get from cache first
    const cacheKey = 'stats:overview:real';
    const cachedStats = await cacheGet<string>(cacheKey);
    if (cachedStats) {
      return sendSuccess(res, JSON.parse(cachedStats));
    }

    // Fetch REAL stats from database in parallel
    const [
      totalDatasets,
      categoriesData,
      totalSignals,
      totalUsers,
      totalContent,
      totalViews,
      activeSignals,
      recentDatasets
    ] = await Promise.all([
      // Total datasets count - REAL
      prisma.dataset.count(),

      // Get unique categories - REAL (filter null in code)
      prisma.dataset.groupBy({
        by: ['category']
      }),

      // Total signals count - REAL
      prisma.signal.count(),

      // Total users count - REAL
      prisma.user.count(),

      // Total content count - REAL
      prisma.content.count(),

      // Total views - REAL
      prisma.content.aggregate({
        _sum: { viewCount: true }
      }),

      // Active signals (not expired) - REAL
      prisma.signal.count({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),

      // Datasets added in last 7 days - REAL
      prisma.dataset.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Calculate growth (new datasets this week vs total)
    const weeklyGrowth = totalDatasets > 0
      ? Math.round((recentDatasets / totalDatasets) * 100 * 10) / 10
      : 0;

    // Filter out null categories
    const validCategories = categoriesData.filter(c => c.category !== null);

    const stats = {
      // All values are REAL from database
      totalDatasets,
      totalCategories: validCategories.length,
      totalSignals,
      activeSignals,
      totalUsers,
      totalContent,
      totalViews: totalViews._sum.viewCount || 0,
      newThisWeek: recentDatasets,
      weeklyGrowth,
      lastUpdated: new Date().toISOString(),
      isRealData: true // Flag to confirm this is real data
    };

    // Cache the results
    await cacheSet(cacheKey, JSON.stringify(stats), CACHE_TTL);

    return sendSuccess(res, stats);
  } catch (err) {
    logger.error('Error fetching overview stats:', err);
    return sendError(res, 'Failed to fetch stats', 'فشل في جلب الإحصائيات', 500);
  }
};

/**
 * Get REAL trending topics from database
 * Based on actual dataset categories and tags
 */
export const getTrendingTopics = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'stats:trending:real';
    const cachedTrending = await cacheGet<string>(cacheKey);
    if (cachedTrending) {
      return sendSuccess(res, JSON.parse(cachedTrending));
    }

    // Get REAL category counts from datasets
    const categoryStatsRaw = await prisma.dataset.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: {
        _count: { id: 'desc' }
      },
      take: 15
    });
    // Filter out null categories
    const categoryStats = categoryStatsRaw.filter(c => c.category !== null).slice(0, 10);

    // Also get tags from content if available
    const recentContent = await prisma.content.findMany({
      where: {
        status: 'PUBLISHED'
      },
      select: {
        tags: true,
        viewCount: true
      },
      take: 200,
      orderBy: { viewCount: 'desc' }
    });

    // Count tags
    const tagCounts: Record<string, number> = {};
    for (const content of recentContent) {
      try {
        const tags = typeof content.tags === 'string'
          ? JSON.parse(content.tags)
          : content.tags;
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            if (tag && typeof tag === 'string') {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }
      } catch {
        // Skip invalid
      }
    }

    // Combine categories and tags
    const colors = ['blue', 'green', 'purple', 'amber', 'indigo', 'rose', 'cyan', 'orange'];

    // Format categories as topics
    const categoryTopics = categoryStats.map((cat, idx) => ({
      tag: cat.category || 'غير مصنف',
      count: cat._count.id,
      countFormatted: cat._count.id >= 1000
        ? `${(cat._count.id / 1000).toFixed(1)}K`
        : cat._count.id.toString(),
      type: 'category',
      color: colors[idx % colors.length]
    }));

    // Format tags as topics
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count], idx) => ({
        tag: tag.startsWith('#') ? tag : `#${tag}`,
        count,
        countFormatted: count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString(),
        type: 'tag',
        color: colors[(idx + 5) % colors.length]
      }));

    const result = {
      categories: categoryTopics,
      tags: sortedTags,
      topics: [...categoryTopics.slice(0, 5), ...sortedTags].slice(0, 5),
      lastUpdated: new Date().toISOString(),
      isRealData: true
    };

    await cacheSet(cacheKey, JSON.stringify(result), 300);

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching trending topics:', err);
    return sendError(res, 'Failed to fetch trending', 'فشل في جلب المواضيع الرائجة', 500);
  }
};

/**
 * Get REAL recent activity stats
 */
export const getRecentActivity = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'stats:activity:real';
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    // Get recent signals
    const recentSignals = await prisma.signal.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        title: true,
        titleAr: true,
        type: true,
        trend: true,
        impactScore: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Get recent content
    const recentContent = await prisma.content.findMany({
      where: {
        status: 'PUBLISHED'
      },
      select: {
        id: true,
        title: true,
        titleAr: true,
        type: true,
        viewCount: true,
        publishedAt: true
      },
      orderBy: { publishedAt: 'desc' },
      take: 5
    });

    // Get latest datasets
    const latestDatasets = await prisma.dataset.findMany({
      select: {
        id: true,
        name: true,
        nameAr: true,
        category: true,
        source: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const result = {
      signals: {
        count: recentSignals.length,
        items: recentSignals
      },
      content: {
        count: recentContent.length,
        items: recentContent
      },
      datasets: {
        count: latestDatasets.length,
        items: latestDatasets
      },
      lastUpdated: new Date().toISOString(),
      isRealData: true
    };

    await cacheSet(cacheKey, JSON.stringify(result), 60);

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching activity:', err);
    return sendError(res, 'Failed to fetch activity', 'فشل في جلب النشاط', 500);
  }
};

/**
 * Get user-specific stats (requires authentication)
 */
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return sendError(res, 'Not authenticated', 'غير مسجل دخول', 401);
    }

    // Get user's real stats
    const [
      user,
      favoritesCount,
      dashboardsCount
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          role: true,
          createdAt: true
        }
      }),
      prisma.favorite.count({
        where: { userId }
      }),
      prisma.dashboard.count({
        where: { userId }
      })
    ]);

    if (!user) {
      return sendError(res, 'User not found', 'المستخدم غير موجود', 404);
    }

    const result = {
      user,
      stats: {
        favorites: favoritesCount,
        dashboards: dashboardsCount,
        memberSince: user.createdAt
      },
      isRealData: true
    };

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching user stats:', err);
    return sendError(res, 'Failed to fetch user stats', 'فشل في جلب إحصائيات المستخدم', 500);
  }
};

/**
 * Get REAL category distribution
 */
export const getCategoryStats = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'stats:categories:real';
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    // Get REAL dataset counts by category
    const categories = await prisma.dataset.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });

    const total = categories.reduce((sum, cat) => sum + cat._count.id, 0);

    const categoryStats = categories.map(cat => ({
      name: cat.category || 'غير مصنف',
      nameEn: cat.category || 'Uncategorized',
      count: cat._count.id,
      percentage: total > 0 ? Math.round((cat._count.id / total) * 100 * 10) / 10 : 0
    }));

    const result = {
      categories: categoryStats,
      total,
      uniqueCategories: categories.length,
      lastUpdated: new Date().toISOString(),
      isRealData: true
    };

    await cacheSet(cacheKey, JSON.stringify(result), 300);

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching category stats:', err);
    return sendError(res, 'Failed to fetch category stats', 'فشل في جلب إحصائيات الفئات', 500);
  }
};

/**
 * Get data sources stats
 */
export const getSourceStats = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'stats:sources:real';
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    // Get dataset counts by source
    const sourcesRaw = await prisma.dataset.groupBy({
      by: ['source'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15
    });
    // Filter out null sources
    const sources = sourcesRaw.filter(s => s.source !== null).slice(0, 10);

    const result = {
      sources: sources.map(s => ({
        name: s.source,
        count: s._count.id
      })),
      totalSources: sources.length,
      lastUpdated: new Date().toISOString(),
      isRealData: true
    };

    await cacheSet(cacheKey, JSON.stringify(result), 300);

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching source stats:', err);
    return sendError(res, 'Failed to fetch source stats', 'فشل في جلب إحصائيات المصادر', 500);
  }
};

/**
 * SSE Stream for data sources stats (WebFlux-style)
 */
export const getSourcesStream = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Get dataset counts by source
    const sourcesRaw = await prisma.dataset.groupBy({
      by: ['source'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20
    });
    const sources = sourcesRaw.filter(s => s.source !== null);

    const totalDatasets = sources.reduce((sum, s) => sum + s._count.id, 0);

    // Send metadata first
    sendEvent('meta', {
      totalSources: sources.length,
      totalDatasets,
      lastUpdated: new Date().toISOString(),
      isRealData: true
    });

    // Stream each source one by one
    for (let i = 0; i < sources.length; i++) {
      sendEvent('source', {
        name: sources[i].source,
        count: sources[i]._count.id,
        percentage: totalDatasets > 0 ? Math.round((sources[i]._count.id / totalDatasets) * 100) : 0,
        index: i
      });
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    // Get overview stats for additional context
    const [totalCategories, totalSignals, totalUsers] = await Promise.all([
      prisma.dataset.groupBy({ by: ['category'] }).then(c => c.filter(x => x.category !== null).length),
      prisma.signal.count({ where: { isActive: true } }),
      prisma.user.count()
    ]);

    sendEvent('overview', {
      totalCategories,
      totalSignals,
      totalUsers,
      totalDatasets
    });

    sendEvent('complete', { count: sources.length });
    res.end();
  } catch (error) {
    logger.error('Error streaming sources:', error);
    sendEvent('error', { message: 'فشل في جلب مصادر البيانات' });
    res.end();
  }
};
