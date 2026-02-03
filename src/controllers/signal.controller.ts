import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { cacheGet, cacheSet, CacheKeys } from '../services/cache.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import { analyzeDatasets, generateDailySummary, analyzeDataset } from '../services/aiAnalysis.js';
import { generateAndSaveRealSignals } from '../services/realSignalGenerator.js';

// Get all signals
export async function getSignals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      type,
      trend,
      region,
      sector,
      minImpact,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where: Record<string, unknown> = {
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (type) where.type = String(type);
    if (trend) where.trend = String(trend);
    if (region) where.region = String(region);
    if (sector) where.sector = String(sector);
    if (minImpact) where.impactScore = { gte: parseFloat(String(minImpact)) };

    // Try cache for default query
    const isDefaultQuery = !type && !trend && !region && !sector && !minImpact && pageNum === 1;
    if (isDefaultQuery) {
      const cached = await cacheGet<{ signals: unknown[]; total: number }>(CacheKeys.signals);
      if (cached) {
        sendPaginated(res, cached.signals as never[], pageNum, limitNum, cached.total);
        return;
      }
    }

    // Query database
    const [signals, total] = await Promise.all([
      prisma.signal.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [
          { impactScore: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.signal.count({ where }),
    ]);

    // Cache default query
    if (isDefaultQuery) {
      await cacheSet(CacheKeys.signals, { signals, total }, 300);
    }

    sendPaginated(res, signals, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get single signal
export async function getSignal(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);

    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal || !signal.isActive) {
      sendError(res, 'Signal not found', 'الإشارة غير موجودة', 404);
      return;
    }

    sendSuccess(res, signal);
  } catch (error) {
    next(error);
  }
}

// Get latest signals (widget endpoint)
export async function getLatestSignals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { limit = '5' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 20);

    const signals = await prisma.signal.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        titleAr: true,
        summary: true,
        summaryAr: true,
        impactScore: true,
        confidence: true,
        trend: true,
        createdAt: true,
      },
    });

    sendSuccess(res, signals);
  } catch (error) {
    next(error);
  }
}

// Get signal stats
export async function getSignalStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [typeStats, trendStats, totalActive] = await Promise.all([
      prisma.signal.groupBy({
        by: ['type'],
        where: { isActive: true },
        _count: { type: true },
        _avg: { impactScore: true },
      }),
      prisma.signal.groupBy({
        by: ['trend'],
        where: { isActive: true },
        _count: { trend: true },
      }),
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

    sendSuccess(res, {
      total: totalActive,
      byType: typeStats.map((t) => ({
        type: t.type,
        count: t._count.type,
        avgImpact: t._avg.impactScore,
      })),
      byTrend: trendStats.map((t) => ({
        trend: t.trend,
        count: t._count.trend,
      })),
    });
  } catch (error) {
    next(error);
  }
}

// Trigger AI analysis (admin only) - NO MOCK DATA
export async function triggerAnalysis(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    console.log('[triggerAnalysis] Starting analysis...');

    // Try OpenAI first
    let result = await analyzeDatasets();
    console.log('[triggerAnalysis] analyzeDatasets result:', result ? 'success' : 'null', 'signals:', result?.signals?.length || 0);

    // If OpenAI fails, use real data analysis (NO MOCK DATA)
    if (!result || result.signals.length === 0) {
      console.log('[triggerAnalysis] Falling back to generateAndSaveRealSignals...');
      result = await generateAndSaveRealSignals();
      console.log('[triggerAnalysis] generateAndSaveRealSignals result:', result ? 'success' : 'null', 'signals:', result?.signals?.length || 0);
    }

    if (!result || result.signals.length === 0) {
      sendError(res, 'No data available for analysis', 'لا توجد بيانات متاحة للتحليل', 404);
      return;
    }

    sendSuccess(res, {
      signalsGenerated: result.signals.length,
      insightsGenerated: result.insights.length,
      summary: result.summary,
      summaryAr: result.summaryAr,
      dataSource: 'REAL_DATA_ANALYSIS',
    }, 'Analysis completed with real data', 'تم إكمال التحليل من بيانات حقيقية');
  } catch (error) {
    console.error('[triggerAnalysis] Error:', error);
    next(error);
  }
}

// Get daily market summary
export async function getDailySummary(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try cache first
    const cached = await cacheGet<{ summary: string; summaryAr: string }>('daily_summary');
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    const summary = await generateDailySummary();

    if (!summary) {
      sendError(res, 'Could not generate summary', 'تعذر إنشاء الملخص', 500);
      return;
    }

    // Cache for 1 hour
    await cacheSet('daily_summary', summary, 3600);

    sendSuccess(res, summary);
  } catch (error) {
    next(error);
  }
}

// Analyze specific dataset
export async function analyzeDatasetSignals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const datasetId = String(req.params.datasetId);

    const signals = await analyzeDataset(datasetId);

    if (signals === null) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    sendSuccess(res, { signals }, 'Dataset analyzed', 'تم تحليل البيانات');
  } catch (error) {
    next(error);
  }
}

// Get signals grouped by category for dashboard
export async function getSignalsDashboard(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [opportunities, risks, trends, alerts] = await Promise.all([
      prisma.signal.findMany({
        where: { type: 'OPPORTUNITY', isActive: true },
        take: 5,
        orderBy: { impactScore: 'desc' },
      }),
      prisma.signal.findMany({
        where: { type: 'RISK', isActive: true },
        take: 5,
        orderBy: { impactScore: 'desc' },
      }),
      prisma.signal.findMany({
        where: { type: 'TREND', isActive: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.signal.findMany({
        where: { type: 'ALERT', isActive: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    sendSuccess(res, {
      opportunities,
      risks,
      trends,
      alerts,
      stats: {
        totalOpportunities: opportunities.length,
        totalRisks: risks.length,
        totalTrends: trends.length,
        totalAlerts: alerts.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getSignals,
  getSignal,
  getLatestSignals,
  getSignalStats,
  triggerAnalysis,
  getDailySummary,
  analyzeDatasetSignals,
  getSignalsDashboard,
};
