/**
 * Dashboard Controller - وحدة تحكم اللوحات
 * كل البيانات حقيقية من قاعدة البيانات - بدون أي بيانات وهمية
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';

// Dashboard categories mapped from real database categories
const CATEGORY_MAP: Record<string, { id: string; label: string; labelEn: string }> = {
  'الميزانية': { id: 'budget', label: 'الميزانية', labelEn: 'Budget' },
  'الاقتصاد': { id: 'economy', label: 'الاقتصاد', labelEn: 'Economy' },
  'العقار': { id: 'real_estate', label: 'العقار', labelEn: 'Real Estate' },
  'الاستثمار': { id: 'investment', label: 'الاستثمار', labelEn: 'Investment' },
  'الطاقة': { id: 'energy', label: 'الطاقة', labelEn: 'Energy' },
  'سوق العمل': { id: 'labor', label: 'سوق العمل', labelEn: 'Labor Market' },
  'السياحة': { id: 'tourism', label: 'السياحة', labelEn: 'Tourism' },
  'التقنية': { id: 'technology', label: 'التقنية', labelEn: 'Technology' },
  'تقنية المعلومات': { id: 'technology', label: 'تقنية المعلومات', labelEn: 'IT' },
  'الحكومة الإلكترونية': { id: 'egovernment', label: 'الحكومة الإلكترونية', labelEn: 'E-Government' },
  'خدمة العملاء': { id: 'customer_service', label: 'خدمة العملاء', labelEn: 'Customer Service' },
  'أخرى': { id: 'other', label: 'أخرى', labelEn: 'Other' },
};

// Color based on category (deterministic, not random)
const CATEGORY_COLORS: Record<string, string> = {
  'budget': 'blue',
  'economy': 'green',
  'real_estate': 'purple',
  'investment': 'amber',
  'energy': 'rose',
  'labor': 'cyan',
  'tourism': 'indigo',
  'technology': 'teal',
  'egovernment': 'blue',
  'customer_service': 'green',
  'other': 'gray',
};

// Get all official dashboards - ALL DATA FROM DATABASE
export async function getDashboards(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Build where clause - show all active datasets
    const where: any = {
      isActive: true
    };

    // Filter by search
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { nameAr: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { descriptionAr: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Filter by category - supports both category ID and category label
    if (category && category !== 'all') {
      // First check if it's a category ID from CATEGORY_MAP
      const matchingCategories = Object.entries(CATEGORY_MAP)
        .filter(([_, value]) => value.id === category)
        .map(([key, _]) => key);

      if (matchingCategories.length > 0) {
        where.category = { in: matchingCategories };
      } else {
        // Otherwise treat it as the actual category label from database
        where.category = category as string;
      }
    }

    // Get total count
    const total = await prisma.dataset.count({ where });

    // Get paginated datasets
    const datasets = await prisma.dataset.findMany({
      where,
      orderBy: { lastSyncAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Transform to dashboard format - ALL REAL DATA
    const dashboards = datasets.map((dataset) => {
      const categoryInfo = CATEGORY_MAP[dataset.category] || CATEGORY_MAP['أخرى'];
      const columns = JSON.parse(dataset.columns || '[]');

      return {
        id: `dash_${dataset.id}`,
        name: dataset.nameAr || dataset.name,
        nameEn: dataset.name,
        description: dataset.descriptionAr || dataset.description || '',
        category: categoryInfo.id,
        categoryLabel: categoryInfo.label,
        source: dataset.source,
        sourceUrl: dataset.sourceUrl,
        color: CATEGORY_COLORS[categoryInfo.id] || 'blue',
        // REAL DATA - no random values
        recordCount: dataset.recordCount,
        columns: columns,
        syncStatus: dataset.syncStatus,
        lastSyncAt: dataset.lastSyncAt,
        lastUpdated: dataset.lastSyncAt ? formatDate(dataset.lastSyncAt) : null,
        createdAt: dataset.createdAt,
        updatedAt: dataset.updatedAt,
        datasetId: dataset.id,
        externalId: dataset.externalId,
      };
    });

    sendPaginated(res, dashboards, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get dashboard categories from actual database
export async function getCategories(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get unique categories from database
    const categoryCounts = await prisma.dataset.groupBy({
      by: ['category'],
      where: {
        isActive: true
      },
      _count: { id: true },
    });

    const categories = [
      { id: 'all', label: 'الكل', labelEn: 'All', count: categoryCounts.reduce((sum, c) => sum + c._count.id, 0), filterValue: 'all' },
      ...categoryCounts.map(c => ({
        id: CATEGORY_MAP[c.category]?.id || 'other',
        label: c.category, // Use actual DB category name as label
        labelEn: CATEGORY_MAP[c.category]?.labelEn || c.category,
        count: c._count.id,
        filterValue: c.category, // Original DB category for filtering
      })),
    ];

    sendSuccess(res, categories);
  } catch (error) {
    next(error);
  }
}

// Get single dashboard with REAL data
export async function getDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    // Extract dataset ID from dashboard ID
    const datasetId = id.startsWith('dash_') ? id.replace('dash_', '') : id;

    // Get dataset from database
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      res.status(404).json({
        success: false,
        error: 'Dashboard not found',
        errorAr: 'اللوحة غير موجودة',
      });
      return;
    }

    const categoryInfo = CATEGORY_MAP[dataset.category] || CATEGORY_MAP['أخرى'];
    const columns = JSON.parse(dataset.columns || '[]');
    const dataPreview = JSON.parse(dataset.dataPreview || '[]');
    const resources = typeof dataset.resources === 'string'
      ? JSON.parse(dataset.resources)
      : dataset.resources;

    // Build response with ALL REAL DATA
    const dashboard = {
      id: `dash_${dataset.id}`,
      name: dataset.nameAr || dataset.name,
      nameEn: dataset.name,
      description: dataset.descriptionAr || dataset.description || '',
      category: categoryInfo.id,
      categoryLabel: categoryInfo.label,
      source: dataset.source,
      sourceUrl: dataset.sourceUrl,
      color: CATEGORY_COLORS[categoryInfo.id] || 'blue',
      // REAL DATA
      recordCount: dataset.recordCount,
      columns: columns,
      dataPreview: dataPreview,
      resources: resources,
      syncStatus: dataset.syncStatus,
      lastSyncAt: dataset.lastSyncAt,
      lastUpdated: dataset.lastSyncAt ? formatDate(dataset.lastSyncAt) : null,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      datasetId: dataset.id,
      externalId: dataset.externalId,
    };

    sendSuccess(res, dashboard);
  } catch (error) {
    next(error);
  }
}

// Format date to Arabic
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default {
  getDashboards,
  getCategories,
  getDashboard,
};
