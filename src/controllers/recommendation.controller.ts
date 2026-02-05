/**
 * Recommendation Controller - التوصيات
 * Simple content/dataset recommendations based on user activity
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Get personalized recommendations based on:
 * 1. User's favorites (items they liked/saved)
 * 2. Entities they follow
 * 3. Recent popular content
 */
export async function getRecommendations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 20);

    // Parallel: get user's interests and popular content
    const [favorites, followedEntities, popularContent, latestSignals, trendingDatasets] = await Promise.all([
      // User's recent favorites to understand interests
      prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { itemType: true, itemId: true },
      }),

      // Entities user follows
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
        take: 10,
      }),

      // Popular published content (not authored by user)
      prisma.content.findMany({
        where: {
          status: 'PUBLISHED',
          authorId: { not: userId },
        },
        orderBy: [{ viewCount: 'desc' }, { likeCount: 'desc' }],
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          titleAr: true,
          excerptAr: true,
          viewCount: true,
          likeCount: true,
          publishedAt: true,
          tags: true,
          author: {
            select: { id: true, name: true, nameAr: true, avatar: true },
          },
        },
      }),

      // Latest high-confidence signals
      prisma.signal.findMany({
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          type: true,
          title: true,
          titleAr: true,
          summaryAr: true,
          impactScore: true,
          confidence: true,
          trend: true,
          createdAt: true,
        },
      }),

      // Trending datasets (most records, recently updated)
      prisma.dataset.findMany({
        where: { isActive: true, recordCount: { gt: 0 } },
        orderBy: [{ recordCount: 'desc' }],
        take: 5,
        select: {
          id: true,
          name: true,
          nameAr: true,
          category: true,
          source: true,
          recordCount: true,
          lastSyncAt: true,
        },
      }),
    ]);

    // Build favorite IDs set for filtering duplicates
    const favoriteIds = new Set(favorites.map((f) => f.itemId));

    // Filter out already-favorited content
    const recommendedContent = popularContent
      .filter((c) => !favoriteIds.has(c.id))
      .map((c) => ({
        ...c,
        tags: safeParseTags(c.tags),
        _type: 'content' as const,
        _reason: 'شائع',
      }));

    const recommendedSignals = latestSignals.map((s) => ({
      ...s,
      _type: 'signal' as const,
      _reason: 'إشارة قوية',
    }));

    const recommendedDatasets = trendingDatasets
      .filter((d) => !favoriteIds.has(d.id))
      .map((d) => ({
        ...d,
        _type: 'dataset' as const,
        _reason: 'بيانات غنية',
      }));

    sendSuccess(res, {
      content: recommendedContent,
      signals: recommendedSignals,
      datasets: recommendedDatasets,
      meta: {
        basedOn: {
          favorites: favorites.length,
          following: followedEntities.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

function safeParseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try { return JSON.parse(tags); } catch { return []; }
  }
  return [];
}

export default { getRecommendations };
