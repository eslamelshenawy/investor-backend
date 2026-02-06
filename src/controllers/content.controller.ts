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

// WebFlux-style Feed Stream (Server-Sent Events)
export async function getFeedStream(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (eventName: string, data: unknown) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    // Send start event
    sendEvent('start', { message: 'بدء تحميل المحتوى...', timestamp: new Date() });

    // Stream content items one by one
    const content = await prisma.content.findMany({
      where: { status: 'PUBLISHED' },
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
    });

    // Stream each content item
    for (const item of content) {
      sendEvent('content', item);
      // Small delay for streaming effect
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send completion event
    sendEvent('complete', {
      message: 'تم تحميل جميع المحتوى',
      total: content.length,
    });

    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل المحتوى', error: String(error) });
    res.end();
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

// Get timeline (all content types mixed) - Dynamic from Database
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

    // Calculate how many items to fetch from each source
    const itemsPerSource = Math.ceil(limitNum / 4);

    // Get data from multiple sources: Content, Signals, Datasets, SyncLogs
    const [content, signals, datasets, syncLogs, totalContent, totalSignals, totalDatasets, totalSyncLogs] = await Promise.all([
      // Content
      prisma.content.findMany({
        where: { status: 'PUBLISHED' },
        skip: Math.floor(skip / 4),
        take: itemsPerSource,
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
      // Signals
      prisma.signal.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        skip: Math.floor(skip / 4),
        take: itemsPerSource,
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
      // Datasets - Recently updated/added
      prisma.dataset.findMany({
        where: { isActive: true },
        skip: Math.floor(skip / 4),
        take: itemsPerSource,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          externalId: true,
          name: true,
          nameAr: true,
          description: true,
          descriptionAr: true,
          category: true,
          source: true,
          recordCount: true,
          syncStatus: true,
          lastSyncAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Sync Logs - Only show syncs that actually did something (not empty syncs)
      prisma.syncLog.findMany({
        where: {
          status: 'SUCCESS',
          OR: [
            { newRecords: { gt: 0 } },
            { updatedRecords: { gt: 0 } },
          ],
        },
        skip: Math.floor(skip / 4),
        take: itemsPerSource,
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          jobType: true,
          status: true,
          recordsCount: true,
          newRecords: true,
          updatedRecords: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      // Counts
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
      prisma.dataset.count({ where: { isActive: true } }),
      prisma.syncLog.count({
        where: {
          status: 'SUCCESS',
          OR: [
            { newRecords: { gt: 0 } },
            { updatedRecords: { gt: 0 } },
          ],
        },
      }),
    ]);

    // Transform and combine all sources
    const timeline = [
      // Content items
      ...content.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        titleAr: c.titleAr,
        excerpt: c.excerpt,
        excerptAr: c.excerptAr,
        tags: c.tags,
        itemType: 'content' as const,
        date: c.publishedAt,
      })),
      // Signal items
      ...signals.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        titleAr: s.titleAr,
        summary: s.summary,
        summaryAr: s.summaryAr,
        impactScore: s.impactScore,
        trend: s.trend,
        itemType: 'signal' as const,
        date: s.createdAt,
      })),
      // Dataset items - transformed to timeline events
      ...datasets.map((d) => {
        const isNew = d.createdAt && d.updatedAt &&
          (d.updatedAt.getTime() - d.createdAt.getTime()) < 60000; // Created within 1 minute
        return {
          id: d.id,
          type: isNew ? 'NEW_DATA' : 'UPDATE',
          title: `${isNew ? 'New Dataset' : 'Dataset Updated'}: ${d.name}`,
          titleAr: `${isNew ? 'بيانات جديدة' : 'تحديث بيانات'}: ${d.nameAr}`,
          summary: d.description || `Dataset from ${d.source}`,
          summaryAr: d.descriptionAr || `بيانات من ${d.source}`,
          impactScore: Math.min(100, 50 + Math.floor(d.recordCount / 100)),
          trend: 'UP',
          tags: JSON.stringify([d.category, d.source]),
          itemType: 'dataset' as const,
          date: d.updatedAt,
          category: d.category,
          recordCount: d.recordCount,
          externalId: d.externalId,
        };
      }),
      // Sync Log items - transformed to timeline events
      ...syncLogs.map((s) => ({
        id: s.id,
        type: 'SYNC',
        title: `Data Sync: ${s.jobType.replace(/_/g, ' ')}`,
        titleAr: `مزامنة البيانات: ${getArabicJobType(s.jobType)}`,
        summary: `Synced ${s.recordsCount} records (${s.newRecords} new, ${s.updatedRecords} updated)`,
        summaryAr: `تمت مزامنة ${s.recordsCount} سجل (${s.newRecords} جديد، ${s.updatedRecords} محدث)`,
        impactScore: Math.min(100, 40 + s.newRecords),
        trend: s.newRecords > 0 ? 'UP' : 'NEUTRAL',
        itemType: 'sync' as const,
        date: s.startedAt,
        recordsCount: s.recordsCount,
        newRecords: s.newRecords,
        updatedRecords: s.updatedRecords,
      })),
    ].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const total = totalContent + totalSignals + totalDatasets + totalSyncLogs;

    sendPaginated(res, timeline, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// WebFlux-style Timeline Stream (Server-Sent Events)
export async function getTimelineStream(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (eventName: string, data: unknown) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const itemsPerSource = Math.ceil(limitNum / 4);

    // Send start event
    sendEvent('start', { message: 'بدء تحميل البيانات...', timestamp: new Date() });

    // Stream Content items
    const content = await prisma.content.findMany({
      where: { status: 'PUBLISHED' },
      take: itemsPerSource,
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
    });

    for (const c of content) {
      sendEvent('item', {
        id: c.id,
        type: c.type,
        title: c.title,
        titleAr: c.titleAr,
        excerpt: c.excerpt,
        excerptAr: c.excerptAr,
        tags: c.tags,
        itemType: 'content',
        date: c.publishedAt,
      });
    }
    sendEvent('progress', { source: 'content', count: content.length });

    // Stream Signals
    const signals = await prisma.signal.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      take: itemsPerSource,
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
    });

    for (const s of signals) {
      sendEvent('item', {
        id: s.id,
        type: s.type,
        title: s.title,
        titleAr: s.titleAr,
        summary: s.summary,
        summaryAr: s.summaryAr,
        impactScore: s.impactScore,
        trend: s.trend,
        itemType: 'signal',
        date: s.createdAt,
      });
    }
    sendEvent('progress', { source: 'signals', count: signals.length });

    // Stream Datasets
    const datasets = await prisma.dataset.findMany({
      where: { isActive: true },
      take: itemsPerSource,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        name: true,
        nameAr: true,
        description: true,
        descriptionAr: true,
        category: true,
        source: true,
        recordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const d of datasets) {
      const isNew = d.createdAt && d.updatedAt &&
        (d.updatedAt.getTime() - d.createdAt.getTime()) < 60000;
      sendEvent('item', {
        id: d.id,
        type: isNew ? 'NEW_DATA' : 'UPDATE',
        title: `${isNew ? 'New Dataset' : 'Dataset Updated'}: ${d.name}`,
        titleAr: `${isNew ? 'بيانات جديدة' : 'تحديث بيانات'}: ${d.nameAr}`,
        summary: d.description || `Dataset from ${d.source}`,
        summaryAr: d.descriptionAr || `بيانات من ${d.source}`,
        impactScore: Math.min(100, 50 + Math.floor(d.recordCount / 100)),
        trend: 'UP',
        itemType: 'dataset',
        date: d.updatedAt,
        category: d.category,
        recordCount: d.recordCount,
        externalId: d.externalId,
      });
    }
    sendEvent('progress', { source: 'datasets', count: datasets.length });

    // Stream Sync Logs
    const syncLogs = await prisma.syncLog.findMany({
      where: {
        status: 'SUCCESS',
        OR: [
          { newRecords: { gt: 0 } },
          { updatedRecords: { gt: 0 } },
        ],
      },
      take: itemsPerSource,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        jobType: true,
        recordsCount: true,
        newRecords: true,
        updatedRecords: true,
        startedAt: true,
      },
    });

    for (const s of syncLogs) {
      sendEvent('item', {
        id: s.id,
        type: 'SYNC',
        title: `Data Sync: ${s.jobType.replace(/_/g, ' ')}`,
        titleAr: `مزامنة البيانات: ${getArabicJobType(s.jobType)}`,
        summary: `Synced ${s.recordsCount} records (${s.newRecords} new, ${s.updatedRecords} updated)`,
        summaryAr: `تمت مزامنة ${s.recordsCount} سجل (${s.newRecords} جديد، ${s.updatedRecords} محدث)`,
        impactScore: Math.min(100, 40 + s.newRecords),
        trend: s.newRecords > 0 ? 'UP' : 'NEUTRAL',
        itemType: 'sync',
        date: s.startedAt,
        recordsCount: s.recordsCount,
        newRecords: s.newRecords,
        updatedRecords: s.updatedRecords,
      });
    }
    sendEvent('progress', { source: 'syncLogs', count: syncLogs.length });

    // Send completion event
    const total = content.length + signals.length + datasets.length + syncLogs.length;
    sendEvent('complete', {
      message: 'تم تحميل جميع البيانات',
      total,
      sources: {
        content: content.length,
        signals: signals.length,
        datasets: datasets.length,
        syncLogs: syncLogs.length,
      },
    });

    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل البيانات', error: String(error) });
    res.end();
  }
}

// Helper function to translate job types to Arabic
function getArabicJobType(jobType: string): string {
  const translations: Record<string, string> = {
    'FULL_DATASET_SYNC': 'مزامنة كاملة للبيانات',
    'INCREMENTAL_SYNC': 'مزامنة تدريجية',
    'METADATA_SYNC': 'مزامنة البيانات الوصفية',
    'RESOURCE_SYNC': 'مزامنة الموارد',
    'PORTAL_SYNC': 'مزامنة البوابة',
    'DAILY_SYNC': 'المزامنة اليومية',
  };
  return translations[jobType] || jobType.replace(/_/g, ' ');
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

// Get trending content and topics
export async function getTrending(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get recent popular content
    const content = await prisma.content.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      select: {
        tags: true,
        viewCount: true
      },
      take: 100
    });

    // Count tag occurrences and views
    const tagStats: Record<string, { count: number; views: number }> = {};

    for (const item of content) {
      try {
        const tags = typeof item.tags === 'string'
          ? JSON.parse(item.tags)
          : item.tags;

        if (Array.isArray(tags)) {
          for (const tag of tags) {
            if (tag && typeof tag === 'string') {
              const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
              if (!tagStats[normalizedTag]) {
                tagStats[normalizedTag] = { count: 0, views: 0 };
              }
              tagStats[normalizedTag].count++;
              tagStats[normalizedTag].views += item.viewCount || 0;
            }
          }
        }
      } catch {
        // Skip invalid tags
      }
    }

    // Sort by count and get top 5
    const sortedTags = Object.entries(tagStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Format trending topics
    const colors = ['blue', 'green', 'purple', 'amber', 'indigo'];
    const topics = sortedTags.map(([tag, stats], idx) => ({
      tag,
      count: stats.count >= 1000
        ? `${(stats.count / 1000).toFixed(1)}K`
        : stats.count.toString(),
      trend: `+${Math.floor(Math.random() * 20 + 5)}%`,
      color: colors[idx % colors.length]
    }));

    // Fallback topics if none found
    const finalTopics = topics.length > 0 ? topics : [
      { tag: '#رؤية_2030', count: '2.4K', trend: '+12%', color: 'blue' },
      { tag: '#الطاقة_المتجددة', count: '1.8K', trend: '+8%', color: 'green' },
      { tag: '#الذكاء_الاصطناعي', count: '3.1K', trend: '+24%', color: 'purple' },
      { tag: '#التعدين', count: '892', trend: '+5%', color: 'amber' },
      { tag: '#الاستثمار_الأجنبي', count: '1.2K', trend: '+15%', color: 'indigo' }
    ];

    sendSuccess(res, {
      topics: finalTopics,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    // Return default topics on error
    sendSuccess(res, {
      topics: [
        { tag: '#رؤية_2030', count: '2.4K', trend: '+12%', color: 'blue' },
        { tag: '#الطاقة_المتجددة', count: '1.8K', trend: '+8%', color: 'green' },
        { tag: '#الذكاء_الاصطناعي', count: '3.1K', trend: '+24%', color: 'purple' },
        { tag: '#التعدين', count: '892', trend: '+5%', color: 'amber' },
        { tag: '#الاستثمار_الأجنبي', count: '1.2K', trend: '+15%', color: 'indigo' }
      ],
      lastUpdated: new Date().toISOString()
    });
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

// Like/Unlike content (toggle)
export async function likeContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user?.userId || null;
    const sessionId = req.headers['x-session-id'] as string || null;

    if (!userId && !sessionId) {
      sendError(res, 'Authentication or session required', 'يرجى تسجيل الدخول', 401);
      return;
    }

    // Check if already liked
    const whereClause = userId
      ? { contentId_userId: { contentId, userId } }
      : { contentId_sessionId: { contentId, sessionId: sessionId! } };

    const existing = await prisma.contentLike.findUnique({ where: whereClause });

    if (existing) {
      // Unlike: remove like and decrement
      await prisma.$transaction([
        prisma.contentLike.delete({ where: { id: existing.id } }),
        prisma.content.update({
          where: { id: contentId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      const updated = await prisma.content.findUnique({
        where: { id: contentId },
        select: { likeCount: true },
      });
      sendSuccess(res, { liked: false, likeCount: updated?.likeCount || 0, contentId });
    } else {
      // Like: create like and increment
      await prisma.$transaction([
        prisma.contentLike.create({
          data: { contentId, userId, sessionId },
        }),
        prisma.content.update({
          where: { id: contentId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      const updated = await prisma.content.findUnique({
        where: { id: contentId },
        select: { likeCount: true, authorId: true, titleAr: true, title: true },
      });
      // Send notification to content author
      if (userId && updated?.authorId && updated.authorId !== userId) {
        import('../utils/notify.js').then(({ notifyNewLike }) => {
          const liker = (req as any).user;
          notifyNewLike(updated.authorId, liker?.nameAr || liker?.name || 'مستخدم', updated.titleAr || updated.title || '', contentId).catch(() => {});
        });
      }
      sendSuccess(res, { liked: true, likeCount: updated?.likeCount || 0, contentId });
    }
  } catch (error) {
    next(error);
  }
}

// Save/Unsave content (toggle bookmark)
export async function saveContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user?.userId;

    if (!userId) {
      sendError(res, 'Authentication required', 'يرجى تسجيل الدخول', 401);
      return;
    }

    // Check if already saved
    const existing = await prisma.contentSave.findUnique({
      where: { contentId_userId: { contentId, userId } },
    });

    if (existing) {
      // Unsave
      await prisma.$transaction([
        prisma.contentSave.delete({ where: { id: existing.id } }),
        prisma.content.update({
          where: { id: contentId },
          data: { saveCount: { decrement: 1 } },
        }),
      ]);
      const updated = await prisma.content.findUnique({
        where: { id: contentId },
        select: { saveCount: true },
      });
      sendSuccess(res, { saved: false, saveCount: updated?.saveCount || 0, contentId });
    } else {
      // Save
      await prisma.$transaction([
        prisma.contentSave.create({
          data: { contentId, userId },
        }),
        prisma.content.update({
          where: { id: contentId },
          data: { saveCount: { increment: 1 } },
        }),
      ]);
      const updated = await prisma.content.findUnique({
        where: { id: contentId },
        select: { saveCount: true },
      });
      sendSuccess(res, { saved: true, saveCount: updated?.saveCount || 0, contentId });
    }
  } catch (error) {
    next(error);
  }
}

// Share content (increment counter)
export async function shareContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);

    const updated = await prisma.content.update({
      where: { id: contentId },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });

    sendSuccess(res, { shared: true, shareCount: updated.shareCount, contentId });
  } catch (error) {
    next(error);
  }
}

// Get engagement stats for a content item
export async function getEngagement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user?.userId;

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      select: {
        likeCount: true,
        saveCount: true,
        commentCount: true,
        shareCount: true,
        viewCount: true,
      },
    });

    if (!content) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    let hasLiked = false;
    let hasSaved = false;

    if (userId) {
      const [like, save] = await Promise.all([
        prisma.contentLike.findUnique({
          where: { contentId_userId: { contentId, userId } },
        }),
        prisma.contentSave.findUnique({
          where: { contentId_userId: { contentId, userId } },
        }),
      ]);
      hasLiked = !!like;
      hasSaved = !!save;
    }

    sendSuccess(res, {
      ...content,
      hasLiked,
      hasSaved,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getFeed,
  getFeedStream,
  getContent,
  getTimeline,
  getTimelineStream,
  getContentTypes,
  getPopularTags,
  getTrending,
  generateFromSignal,
  generateReport,
  generateSectorReport,
  createContent,
  likeContent,
  saveContent,
  shareContent,
  getEngagement,
};
