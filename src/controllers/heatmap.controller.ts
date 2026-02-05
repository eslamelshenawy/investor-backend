import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess } from '../utils/response.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { cacheGet, cacheSet } from '../services/cache.js';

const CACHE_TTL = 120; // 2 minutes

/**
 * Get heatmap data for sector, geographic, and temporal visualizations.
 * Aggregates datasets by category, signals by region, and activity by month.
 */
export const getHeatmapData = async (
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  try {
    // Try cache first
    const cacheKey = 'heatmap:data';
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    // ── Sector Heatmap ─────────────────────────────────────────────────
    // Datasets grouped by category + signals grouped by sector with avg impact

    const [datasetsByCategory, signalsBySector] = await Promise.all([
      prisma.dataset.groupBy({
        by: ['category'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.signal.groupBy({
        by: ['sector'],
        _count: { id: true },
        _avg: { impactScore: true },
        where: { sector: { not: null } },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    // Build a lookup of signal stats keyed by sector name
    const signalSectorMap: Record<string, { count: number; avgImpact: number }> = {};
    for (const s of signalsBySector) {
      if (s.sector) {
        signalSectorMap[s.sector] = {
          count: s._count.id,
          avgImpact: Math.round(s._avg.impactScore ?? 0),
        };
      }
    }

    const sectorHeatmap = datasetsByCategory
      .filter((d) => d.category !== null)
      .map((d) => {
        const sector = d.category || 'غير مصنف';
        const signalInfo = signalSectorMap[sector] || { count: 0, avgImpact: 0 };
        return {
          sector,
          datasetCount: d._count.id,
          signalCount: signalInfo.count,
          avgImpact: signalInfo.avgImpact,
        };
      });

    // ── Region Heatmap ─────────────────────────────────────────────────
    // Signals grouped by region with average impact score

    const signalsByRegion = await prisma.signal.groupBy({
      by: ['region'],
      _count: { id: true },
      _avg: { impactScore: true },
      where: { region: { not: null } },
      orderBy: { _count: { id: 'desc' } },
    });

    const regionHeatmap = signalsByRegion
      .filter((r) => r.region !== null)
      .map((r) => ({
        region: r.region || 'غير محدد',
        signalCount: r._count.id,
        avgImpact: Math.round(r._avg.impactScore ?? 0),
      }));

    // ── Temporal Heatmap ───────────────────────────────────────────────
    // Signals and dataset updates over the last 12 months

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [recentSignals, recentDatasets] = await Promise.all([
      prisma.signal.findMany({
        where: { createdAt: { gte: twelveMonthsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.dataset.findMany({
        where: { updatedAt: { gte: twelveMonthsAgo } },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    // Group by YYYY-MM using JS
    const monthBuckets: Record<string, { signalCount: number; datasetUpdates: number }> = {};

    // Pre-populate the last 12 months so every month appears even if empty
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = { signalCount: 0, datasetUpdates: 0 };
    }

    for (const sig of recentSignals) {
      const key = `${sig.createdAt.getFullYear()}-${String(sig.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) {
        monthBuckets[key].signalCount++;
      }
    }

    for (const ds of recentDatasets) {
      const key = `${ds.updatedAt.getFullYear()}-${String(ds.updatedAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) {
        monthBuckets[key].datasetUpdates++;
      }
    }

    const temporalHeatmap = Object.entries(monthBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        signalCount: data.signalCount,
        datasetUpdates: data.datasetUpdates,
      }));

    // ── Response ────────────────────────────────────────────────────────

    const result = {
      sectorHeatmap,
      regionHeatmap,
      temporalHeatmap,
      lastUpdated: new Date().toISOString(),
      isRealData: true,
    };

    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL);

    return sendSuccess(res, result);
  } catch (err) {
    logger.error('Error fetching heatmap data:', err);
    return sendError(res, 'Failed to fetch heatmap data', 'فشل في جلب بيانات خريطة الحرارة', 500);
  }
};

/**
 * SSE stream for heatmap data.
 * Streams sector, region, and temporal data as separate events.
 */
export const getHeatmapStream = async (
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Try cache first
    const cacheKey = 'heatmap:data';
    const cached = await cacheGet<string>(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      send('sector', parsed.sectorHeatmap || []);
      send('region', parsed.regionHeatmap || []);
      send('temporal', parsed.temporalHeatmap || []);
      send('meta', { lastUpdated: parsed.lastUpdated, isRealData: true });
      send('complete', { status: 'done' });
      res.end();
      return;
    }

    // ── Sector Heatmap ──────────────────────────────────────────────────
    const [datasetsByCategory, signalsBySector] = await Promise.all([
      prisma.dataset.groupBy({
        by: ['category'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.signal.groupBy({
        by: ['sector'],
        _count: { id: true },
        _avg: { impactScore: true },
        where: { sector: { not: null } },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    const signalSectorMap: Record<string, { count: number; avgImpact: number }> = {};
    for (const s of signalsBySector) {
      if (s.sector) {
        signalSectorMap[s.sector] = {
          count: s._count.id,
          avgImpact: Math.round(s._avg.impactScore ?? 0),
        };
      }
    }

    const sectorHeatmap = datasetsByCategory
      .filter((d) => d.category !== null)
      .map((d) => {
        const sector = d.category || 'غير مصنف';
        const signalInfo = signalSectorMap[sector] || { count: 0, avgImpact: 0 };
        return {
          sector,
          datasetCount: d._count.id,
          signalCount: signalInfo.count,
          avgImpact: signalInfo.avgImpact,
        };
      });

    send('sector', sectorHeatmap);

    // ── Region Heatmap ──────────────────────────────────────────────────
    const signalsByRegion = await prisma.signal.groupBy({
      by: ['region'],
      _count: { id: true },
      _avg: { impactScore: true },
      where: { region: { not: null } },
      orderBy: { _count: { id: 'desc' } },
    });

    const regionHeatmap = signalsByRegion
      .filter((r) => r.region !== null)
      .map((r) => ({
        region: r.region || 'غير محدد',
        signalCount: r._count.id,
        avgImpact: Math.round(r._avg.impactScore ?? 0),
      }));

    send('region', regionHeatmap);

    // ── Temporal Heatmap ────────────────────────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [recentSignals, recentDatasets] = await Promise.all([
      prisma.signal.findMany({
        where: { createdAt: { gte: twelveMonthsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.dataset.findMany({
        where: { updatedAt: { gte: twelveMonthsAgo } },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    const monthBuckets: Record<string, { signalCount: number; datasetUpdates: number }> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = { signalCount: 0, datasetUpdates: 0 };
    }

    for (const sig of recentSignals) {
      const key = `${sig.createdAt.getFullYear()}-${String(sig.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) monthBuckets[key].signalCount++;
    }

    for (const ds of recentDatasets) {
      const key = `${ds.updatedAt.getFullYear()}-${String(ds.updatedAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) monthBuckets[key].datasetUpdates++;
    }

    const temporalHeatmap = Object.entries(monthBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        signalCount: data.signalCount,
        datasetUpdates: data.datasetUpdates,
      }));

    send('temporal', temporalHeatmap);

    // ── Cache & complete ────────────────────────────────────────────────
    const lastUpdated = new Date().toISOString();
    const result = { sectorHeatmap, regionHeatmap, temporalHeatmap, lastUpdated, isRealData: true };
    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL);

    send('meta', { lastUpdated, isRealData: true });
    send('complete', { status: 'done' });
  } catch (err) {
    logger.error('Error streaming heatmap data:', err);
    send('error', { message: 'فشل في جلب بيانات خريطة الحرارة' });
  } finally {
    res.end();
  }
};

export default { getHeatmapData, getHeatmapStream };
