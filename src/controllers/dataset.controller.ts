/**
 * Dataset Controller - On-Demand Architecture
 *
 * ⚠️ البيانات الفعلية تُجلب On-Demand من API (لا تُخزن في DB)
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { cacheGet, cacheSet, CacheKeys } from '../services/cache.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import {
  getDatasetData as fetchOnDemandData,
  getDatasetPreview,
  fetchDatasetMetadata,
  clearDatasetCache,
  fetchDatasetsList,
  fetchAllDatasets,
} from '../services/onDemandData.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Get all datasets (metadata from DB)
// ═══════════════════════════════════════════════════════════════════

export async function getDatasets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category, status, search, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (category) {
      where.category = String(category);
    }

    if (status) {
      where.syncStatus = String(status);
    }

    if (search) {
      const searchStr = String(search);
      where.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { nameAr: { contains: searchStr } },
        { description: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    // Try cache first
    const cacheKey = `${CacheKeys.datasets}:${JSON.stringify({ where, pageNum, limitNum })}`;
    const cached = await cacheGet<{ datasets: unknown[]; total: number }>(cacheKey);

    if (cached) {
      sendPaginated(res, cached.datasets as never[], pageNum, limitNum, cached.total);
      return;
    }

    // Query database (metadata only)
    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        skip,
        take: limitNum,
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
          sourceUrl: true,
          recordCount: true,
          columns: true,
          lastSyncAt: true,
          syncStatus: true,
          updatedAt: true,
        },
      }),
      prisma.dataset.count({ where }),
    ]);

    // Parse columns JSON
    const formattedDatasets = datasets.map((d) => ({
      ...d,
      columns: d.columns ? JSON.parse(d.columns) : [],
    }));

    // Cache result
    await cacheSet(cacheKey, { datasets: formattedDatasets, total }, 300);

    sendPaginated(res, formattedDatasets, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get single dataset (metadata from DB)
// ═══════════════════════════════════════════════════════════════════

export async function getDataset(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);

    // Try cache first
    const cached = await cacheGet(CacheKeys.dataset(id));
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [{ id }, { externalId: id }],
        isActive: true,
      },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    // Parse JSON fields
    const formattedDataset = {
      ...dataset,
      columns: dataset.columns ? JSON.parse(dataset.columns) : [],
      dataPreview: dataset.dataPreview ? JSON.parse(dataset.dataPreview) : [],
    };

    // Cache result
    await cacheSet(CacheKeys.dataset(id), formattedDataset, 600);

    sendSuccess(res, formattedDataset);
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get dataset data (ON-DEMAND from API - NOT from DB!)
// This is the key change - data is fetched from Saudi Open Data API directly
// ═══════════════════════════════════════════════════════════════════

export async function getDatasetData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const {
      page = '1',
      limit = '100',
      refresh = 'false',
    } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = Math.min(parseInt(String(limit), 10), 1000);
    const offset = (pageNum - 1) * limitNum;
    const forceRefresh = String(refresh) === 'true';

    // Find dataset to get externalId
    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [{ id }, { externalId: id }],
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        nameAr: true,
        columns: true,
        recordCount: true,
      },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    logger.info(`📊 Fetching on-demand data for: ${dataset.nameAr}`);

    // Fetch data ON-DEMAND from Saudi Open Data API
    const data = await fetchOnDemandData(dataset.externalId, {
      limit: limitNum,
      offset,
      forceRefresh,
    });

    if (!data) {
      sendError(res, 'Failed to fetch data', 'فشل في جلب البيانات', 500);
      return;
    }

    sendSuccess(res, {
      dataset: {
        id: dataset.id,
        externalId: dataset.externalId,
        name: dataset.name,
        nameAr: dataset.nameAr,
      },
      records: data.records,
      columns: data.columns,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: data.totalRecords,
        totalPages: Math.ceil(data.totalRecords / limitNum),
        fetchedAt: data.fetchedAt,
        source: data.source, // 'api' or 'cache'
      },
    });
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get dataset preview (first N records - ON-DEMAND)
// ═══════════════════════════════════════════════════════════════════

export async function getDatasetPreviewData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const { count = '10' } = req.query;
    const previewCount = Math.min(parseInt(String(count), 10), 50);

    // Find dataset
    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [{ id }, { externalId: id }],
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        nameAr: true,
      },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    // Fetch preview ON-DEMAND
    const preview = await getDatasetPreview(dataset.externalId, previewCount);

    if (!preview) {
      sendError(res, 'Failed to fetch preview', 'فشل في جلب المعاينة', 500);
      return;
    }

    sendSuccess(res, {
      dataset: {
        id: dataset.id,
        name: dataset.name,
        nameAr: dataset.nameAr,
      },
      preview: preview.records,
      columns: preview.columns,
      totalRecords: preview.totalRecords,
    });
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Refresh dataset cache (clear and re-fetch)
// ═══════════════════════════════════════════════════════════════════

export async function refreshDatasetCache(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);

    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [{ id }, { externalId: id }],
        isActive: true,
      },
      select: { externalId: true, nameAr: true },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    // Clear cache
    await clearDatasetCache(dataset.externalId);

    // Pre-fetch to warm cache
    const data = await fetchOnDemandData(dataset.externalId, { forceRefresh: true });

    sendSuccess(res, {
      message: 'Cache refreshed successfully',
      messageAr: 'تم تحديث الـ Cache بنجاح',
      dataset: dataset.nameAr,
      recordsFetched: data?.totalRecords || 0,
    });
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get dataset categories
// ═══════════════════════════════════════════════════════════════════

export async function getCategories(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const categories = await prisma.dataset.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    sendSuccess(
      res,
      categories.map((c) => ({
        name: c.category,
        count: c._count.category,
      }))
    );
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get sync status
// ═══════════════════════════════════════════════════════════════════

export async function getSyncStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [latestSyncs, stats, totalRecordCount] = await Promise.all([
      prisma.syncLog.findMany({
        take: 10,
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          jobType: true,
          status: true,
          recordsCount: true,
          newRecords: true,
          duration: true,
          error: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      prisma.dataset.groupBy({
        by: ['syncStatus'],
        _count: { syncStatus: true },
      }),
      prisma.dataset.aggregate({
        _sum: { recordCount: true },
      }),
    ]);

    const statusCounts = stats.reduce(
      (acc, s) => {
        acc[s.syncStatus] = s._count.syncStatus;
        return acc;
      },
      {} as Record<string, number>
    );

    sendSuccess(res, {
      architecture: 'on-demand', // Indicate we use on-demand architecture
      latestSyncs,
      stats: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        estimatedTotalRecords: totalRecordCount._sum.recordCount || 0,
        ...statusCounts,
      },
      note: 'البيانات تُجلب On-Demand من API عند الطلب (لا تُخزن في DB)',
    });
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Get datasets list DIRECTLY from Saudi API (no DB)
// NEW: This fetches from CKAN API with Redis caching
// ═══════════════════════════════════════════════════════════════════

export async function getSaudiDatasets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      page = '1',
      limit = '100',
      search,
      category,
      refresh = 'false',
    } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = Math.min(parseInt(String(limit), 10), 500);
    const forceRefresh = String(refresh) === 'true';

    logger.info(`📊 API: Fetching Saudi datasets (page: ${pageNum}, limit: ${limitNum})`);

    const result = await fetchDatasetsList({
      page: pageNum,
      limit: limitNum,
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      forceRefresh,
    });

    sendSuccess(res, {
      datasets: result.datasets,
      meta: {
        page: result.page,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
        hasMore: result.hasMore,
        fetchedAt: result.fetchedAt,
        source: result.source,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * جلب كل الـ Datasets من Saudi API (مع pagination تلقائي)
 */
export async function getAllSaudiDatasets(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info(`🚀 API: Fetching ALL Saudi datasets`);

    const datasets = await fetchAllDatasets();

    sendSuccess(res, {
      datasets,
      meta: {
        total: datasets.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════

export default {
  getDatasets,
  getDataset,
  getDatasetData,
  getDatasetPreviewData,
  refreshDatasetCache,
  getCategories,
  getSyncStatus,
  getSaudiDatasets,
  getAllSaudiDatasets,
};
