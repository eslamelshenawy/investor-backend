import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { cacheGet, cacheSet, CacheKeys } from '../services/cache.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

// Get all datasets
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
        { nameAr: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    // Try cache first
    const cacheKey = `${CacheKeys.datasets}:${JSON.stringify({ where, pageNum, limitNum })}`;
    const cached = await cacheGet<{ datasets: unknown[]; total: number }>(cacheKey);

    if (cached) {
      sendPaginated(res, cached.datasets as never[], pageNum, limitNum, cached.total);
      return;
    }

    // Query database
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
          recordCount: true,
          lastSyncAt: true,
          syncStatus: true,
          updatedAt: true,
        },
      }),
      prisma.dataset.count({ where }),
    ]);

    // Cache result
    await cacheSet(cacheKey, { datasets, total }, 300);

    sendPaginated(res, datasets, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get single dataset
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
        OR: [
          { id },
          { externalId: id },
        ],
        isActive: true,
      },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    // Cache result
    await cacheSet(CacheKeys.dataset(id), dataset, 600);

    sendSuccess(res, dataset);
  } catch (error) {
    next(error);
  }
}

// Get dataset data/records
export async function getDatasetData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const { page = '1', limit = '100' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = Math.min(parseInt(String(limit), 10), 1000);
    const skip = (pageNum - 1) * limitNum;

    // Find dataset
    const dataset = await prisma.dataset.findFirst({
      where: {
        OR: [
          { id },
          { externalId: id },
        ],
        isActive: true,
      },
      select: { id: true, name: true, nameAr: true, columns: true },
    });

    if (!dataset) {
      sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
      return;
    }

    // Get records
    const [records, total] = await Promise.all([
      prisma.dataRecord.findMany({
        where: { datasetId: dataset.id },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: { data: true, createdAt: true },
      }),
      prisma.dataRecord.count({ where: { datasetId: dataset.id } }),
    ]);

    sendSuccess(res, {
      dataset: {
        id: dataset.id,
        name: dataset.name,
        nameAr: dataset.nameAr,
        columns: dataset.columns,
      },
      records: records.map((r) => r.data),
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get dataset categories
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

// Get sync status
export async function getSyncStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get latest sync logs
    const [latestSyncs, stats] = await Promise.all([
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
    ]);

    const statusCounts = stats.reduce(
      (acc, s) => {
        acc[s.syncStatus] = s._count.syncStatus;
        return acc;
      },
      {} as Record<string, number>
    );

    sendSuccess(res, {
      latestSyncs,
      stats: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        ...statusCounts,
      },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getDatasets,
  getDataset,
  getDatasetData,
  getCategories,
  getSyncStatus,
};
