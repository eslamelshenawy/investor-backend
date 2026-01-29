import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { cacheGet, cacheSet, CacheKeys } from '../services/cache.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import {
  generateArticleFromSignal,
  generateMarketReport,
  generateSectorAnalysis,
  createGeneratedContent,
} from '../services/contentGeneration.js';

// Get content feed
export async function getFeed(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      type,
      tags,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where: Record<string, unknown> = {
      status: 'PUBLISHED',
    };

    if (type) where.type = String(type);
    if (tags) {
      const tagList = String(tags).split(',');
      where.tags = { hasSome: tagList };
    }
    if (search) {
      const searchStr = String(search);
      where.OR = [
        { title: { contains: searchStr, mode: 'insensitive' } },
        { titleAr: { contains: searchStr, mode: 'insensitive' } },
        { body: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    // Try cache for default feed
    const isDefaultQuery = !type && !tags && !search && pageNum === 1;
    if (isDefaultQuery) {
      const cached = await cacheGet<{ content: unknown[]; total: number }>(CacheKeys.content);
      if (cached) {
        sendPaginated(res, cached.content as never[], pageNum, limitNum, cached.total);
        return;
      }
    }

    // Query database
    const [content, total] = await Promise.all([
      prisma.content.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          titleAr: true,
          excerpt: true,
          excerptAr: true,
          tags: true,
          viewCount: true,
          publishedAt: true,
        },
      }),
      prisma.content.count({ where }),
    ]);

    // Cache default feed
    if (isDefaultQuery) {
      await cacheSet(CacheKeys.content, { content, total }, 300);
    }

    sendPaginated(res, content, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get single content item
export async function getContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);

    const content = await prisma.content.findUnique({
      where: { id },
    });

    if (!content || content.status !== 'PUBLISHED') {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    // Increment view count
    await prisma.content.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    sendSuccess(res, content);
  } catch (error) {
    next(error);
  }
}

// Get timeline (all content types mixed)
export async function getTimeline(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '30' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get both content and signals
    const [content, signals, totalContent, totalSignals] = await Promise.all([
      prisma.content.findMany({
        where: { status: 'PUBLISHED' },
        skip: Math.floor(skip / 2),
        take: Math.floor(limitNum / 2),
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          titleAr: true,
          excerpt: true,
          excerptAr: true,
          tags: true,
          publishedAt: true,
        },
      }),
      prisma.signal.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limitNum / 2),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          titleAr: true,
          summary: true,
          summaryAr: true,
          impactScore: true,
          trend: true,
          createdAt: true,
        },
      }),
      prisma.content.count({ where: { status: 'PUBLISHED' } }),
      prisma.signal.count({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      }),
    ]);

    // Combine and sort by date
    const timeline = [
      ...content.map((c) => ({
        ...c,
        itemType: 'content' as const,
        date: c.publishedAt,
      })),
      ...signals.map((s) => ({
        ...s,
        itemType: 'signal' as const,
        date: s.createdAt,
      })),
    ].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const total = totalContent + totalSignals;

    sendPaginated(res, timeline, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get content types with counts
export async function getContentTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = await prisma.content.groupBy({
      by: ['type'],
      where: { status: 'PUBLISHED' },
      _count: { type: true },
      orderBy: { _count: { type: 'desc' } },
    });

    sendSuccess(
      res,
      types.map((t) => ({
        type: t.type,
        count: t._count.type,
      }))
    );
  } catch (error) {
    next(error);
  }
}

// Get popular tags
export async function getPopularTags(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { limit = '20' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const content = await prisma.content.findMany({
      where: { status: 'PUBLISHED' },
      select: { tags: true },
    });

    // Count tags (tags is stored as JSON string)
    const tagCounts = new Map<string, number>();
    content.forEach((c) => {
      try {
        const tagsArray = JSON.parse(c.tags) as string[];
        tagsArray.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      } catch {
        // Ignore invalid JSON
      }
    });

    // Sort and limit
    const popularTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limitNum)
      .map(([tag, count]) => ({ tag, count }));

    sendSuccess(res, popularTags);
  } catch (error) {
    next(error);
  }
}

// Generate article from signal (Admin only)
export async function generateFromSignal(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { signalId } = req.params;

    const content = await generateArticleFromSignal(signalId);
    if (!content) {
      sendError(res, 'Failed to generate content', 'فشل في توليد المحتوى', 500);
      return;
    }

    const saved = await createGeneratedContent('ARTICLE', content);
    sendSuccess(res, saved, 'Content generated successfully', 'تم توليد المحتوى بنجاح');
  } catch (error) {
    next(error);
  }
}

// Generate daily market report (Admin only)
export async function generateReport(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const content = await generateMarketReport();
    if (!content) {
      sendError(res, 'Failed to generate report', 'فشل في توليد التقرير', 500);
      return;
    }

    const saved = await createGeneratedContent('REPORT', content);
    sendSuccess(res, saved, 'Report generated successfully', 'تم توليد التقرير بنجاح');
  } catch (error) {
    next(error);
  }
}

// Generate sector analysis (Admin only)
export async function generateSectorReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sector } = req.params;

    const content = await generateSectorAnalysis(sector);
    if (!content) {
      sendError(res, 'Failed to generate analysis', 'فشل في توليد التحليل', 500);
      return;
    }

    const saved = await createGeneratedContent('ANALYSIS', content);
    sendSuccess(res, saved, 'Analysis generated successfully', 'تم توليد التحليل بنجاح');
  } catch (error) {
    next(error);
  }
}

// Create content manually
export async function createContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { type, title, titleAr, body, bodyAr, excerpt, excerptAr, tags, datasetId } = req.body;

    if (!type || !title || !titleAr || !body || !bodyAr) {
      sendError(res, 'Missing required fields', 'حقول مطلوبة مفقودة', 400);
      return;
    }

    const content = await prisma.content.create({
      data: {
        type,
        title,
        titleAr,
        body,
        bodyAr,
        excerpt,
        excerptAr,
        tags: JSON.stringify(tags || []),
        datasetId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    sendSuccess(res, content, 'Content created successfully', 'تم إنشاء المحتوى بنجاح');
  } catch (error) {
    next(error);
  }
}

export default {
  getFeed,
  getContent,
  getTimeline,
  getContentTypes,
  getPopularTags,
  generateFromSignal,
  generateReport,
  generateSectorReport,
  createContent,
};
