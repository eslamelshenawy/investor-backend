/**
 * Widget Controller - التحكم بالمؤشرات الذكية
 * Provides API for dashboard widgets/indicators
 * Memory-optimized for Railway free tier (512MB limit)
 */

import { Request, Response } from 'express';
import { prisma } from '../services/database.js';

// Widget types
type AtomicWidgetType = 'metric' | 'sparkline' | 'progress' | 'donut' | 'status' | 'gauge';
type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'kpi' | 'table' | 'map' | 'scatter';

interface Widget {
  id: string;
  title: string;
  type: ChartType;
  category: string;
  description: string;
  data: Array<{ name: string; value: number }>;
  lastRefresh: string;
  atomicType: AtomicWidgetType;
  atomicMetadata: {
    trend?: number;
    target?: number;
    statusColor?: string;
    subLabel?: string;
  };
}

// Widget categories with their configurations
const CATEGORIES = [
  { id: 'finance', label: 'المالية', labelEn: 'Finance', colors: ['blue', 'indigo'] },
  { id: 'economy', label: 'الاقتصاد', labelEn: 'Economy', colors: ['green', 'emerald'] },
  { id: 'real_estate', label: 'العقار', labelEn: 'Real Estate', colors: ['amber', 'yellow'] },
  { id: 'energy', label: 'الطاقة', labelEn: 'Energy', colors: ['orange', 'red'] },
  { id: 'labor', label: 'سوق العمل', labelEn: 'Labor Market', colors: ['purple', 'violet'] },
  { id: 'trade', label: 'التجارة', labelEn: 'Trade', colors: ['cyan', 'sky'] },
  { id: 'investment', label: 'الاستثمار', labelEn: 'Investment', colors: ['rose', 'pink'] },
  { id: 'tech', label: 'التقنية', labelEn: 'Technology', colors: ['slate', 'gray'] }
];

const ATOMIC_TYPES: AtomicWidgetType[] = ['metric', 'sparkline', 'progress', 'donut', 'status', 'gauge'];

/**
 * Convert a dataset to a widget (pure function, no DB call)
 */
function datasetToWidget(dataset: any, index: number): Widget {
  const atomicType = ATOMIC_TYPES[index % ATOMIC_TYPES.length];
  const trend = Math.floor(Math.random() * 30) - 10;
  const value = dataset.recordCount || Math.floor(Math.random() * 10000);

  return {
    id: `dataset_${dataset.id}`,
    title: dataset.nameAr || dataset.name,
    type: atomicType === 'sparkline' ? 'line' : atomicType === 'donut' ? 'pie' : 'kpi',
    category: dataset.category,
    description: dataset.descriptionAr || dataset.description || '',
    data: [{ name: 'Current', value }],
    lastRefresh: dataset.lastSyncAt?.toISOString() || new Date().toISOString(),
    atomicType,
    atomicMetadata: {
      trend,
      target: Math.floor(Math.random() * 100),
      statusColor: trend > 0 ? 'green' : trend < -5 ? 'red' : 'amber',
      subLabel: ['شهري', 'سنوي', 'تراكمي', 'ربع سنوي'][index % 4]
    }
  };
}

/**
 * Convert a signal to a widget
 */
function signalToWidget(signal: any, index: number): Widget {
  const atomicType = ATOMIC_TYPES[(index + 3) % ATOMIC_TYPES.length];
  return {
    id: `signal_${signal.id}`,
    title: signal.titleAr || signal.title,
    type: atomicType === 'status' ? 'kpi' : 'line',
    category: signal.type,
    description: signal.summaryAr || signal.summary,
    data: [{ name: 'Impact', value: signal.impactScore * 10 }],
    lastRefresh: signal.createdAt.toISOString(),
    atomicType,
    atomicMetadata: {
      trend: signal.trend === 'up' ? 15 : signal.trend === 'down' ? -12 : 0,
      target: signal.confidence,
      statusColor: signal.trend === 'up' ? 'green' : signal.trend === 'down' ? 'red' : 'amber',
      subLabel: signal.trend === 'up' ? 'صاعد' : signal.trend === 'down' ? 'هابط' : 'مستقر'
    }
  };
}

/**
 * Get all widgets with filtering and pagination
 * Uses cursor-based pagination to avoid loading all data
 */
export const getWidgets = async (req: Request, res: Response) => {
  try {
    const { category, search, type, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 per request
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = { isActive: true };
    if (category && category !== 'ALL' && category !== 'all') {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { nameAr: { contains: search as string, mode: 'insensitive' } },
        { category: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Fetch paginated datasets
    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { recordCount: 'desc' },
        select: { id: true, name: true, nameAr: true, descriptionAr: true, description: true, category: true, recordCount: true, lastSyncAt: true }
      }),
      prisma.dataset.count({ where })
    ]);

    // Convert to widgets
    let widgets: Widget[] = datasets.map((ds, i) => datasetToWidget(ds, skip + i));

    // Filter by atomic type if specified
    if (type) {
      widgets = widgets.filter(w => w.atomicType === type);
    }

    res.json({
      success: true,
      data: widgets,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching widgets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch widgets',
      errorAr: 'فشل في جلب المؤشرات'
    });
  }
};

/**
 * Stream widgets (WebFlux-style SSE)
 * True streaming - fetches data in batches and streams progressively
 * Memory efficient - never loads all data at once
 */
export const getWidgetsStream = async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { category, search, type } = req.query;

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Build where clause
    const where: any = { isActive: true };
    if (category && category !== 'ALL' && category !== 'all') {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { nameAr: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Get total count first (cheap query)
    const total = await prisma.dataset.count({ where });

    // Get category stats
    const categoryCounts = await prisma.dataset.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { id: true }
    });

    // Send metadata immediately
    sendEvent('meta', {
      total,
      categories: CATEGORIES.map(c => ({
        ...c,
        count: categoryCounts.find(cc => cc.category === c.id)?._count.id || 0
      })),
      typeStats: {} // Will be calculated as we stream
    });

    // Stream datasets in batches of 50
    const BATCH_SIZE = 50;
    let streamed = 0;
    let globalIndex = 0;

    while (streamed < total) {
      // Fetch next batch
      const datasets = await prisma.dataset.findMany({
        where,
        skip: streamed,
        take: BATCH_SIZE,
        orderBy: { recordCount: 'desc' },
        select: { id: true, name: true, nameAr: true, descriptionAr: true, description: true, category: true, recordCount: true, lastSyncAt: true }
      });

      if (datasets.length === 0) break;

      // Stream each widget in this batch
      for (const dataset of datasets) {
        const widget = datasetToWidget(dataset, globalIndex);

        // Filter by type if specified
        if (!type || widget.atomicType === type) {
          sendEvent('widget', widget);
        }

        globalIndex++;
      }

      streamed += datasets.length;

      // Small delay between batches to avoid overwhelming the client
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Stream signals at the end
    const signals = await prisma.signal.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    for (let i = 0; i < signals.length; i++) {
      const widget = signalToWidget(signals[i], i);
      if (!type || widget.atomicType === type) {
        sendEvent('widget', widget);
      }
    }

    // Signal completion
    sendEvent('complete', { count: globalIndex + signals.length });
    res.end();
  } catch (error) {
    console.error('Error streaming widgets:', error);
    sendEvent('error', { message: 'فشل في جلب المؤشرات' });
    res.end();
  }
};

/**
 * Get widget by ID
 */
export const getWidget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Parse the ID to determine type
    if (id.startsWith('dataset_')) {
      const datasetId = id.replace('dataset_', '').replace('_secondary', '');
      const dataset = await prisma.dataset.findUnique({
        where: { id: datasetId },
        select: { id: true, name: true, nameAr: true, descriptionAr: true, description: true, category: true, recordCount: true, lastSyncAt: true }
      });

      if (dataset) {
        return res.json({
          success: true,
          data: datasetToWidget(dataset, 0)
        });
      }
    } else if (id.startsWith('signal_')) {
      const signalId = id.replace('signal_', '');
      const signal = await prisma.signal.findUnique({
        where: { id: signalId }
      });

      if (signal) {
        return res.json({
          success: true,
          data: signalToWidget(signal, 0)
        });
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Widget not found',
      errorAr: 'المؤشر غير موجود'
    });
  } catch (error) {
    console.error('Error fetching widget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch widget',
      errorAr: 'فشل في جلب المؤشر'
    });
  }
};

/**
 * Get widget categories
 */
export const getWidgetCategories = async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: CATEGORIES
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch widget categories',
      errorAr: 'فشل في جلب فئات المؤشرات'
    });
  }
};

/**
 * Get widget types
 */
export const getWidgetTypes = async (_req: Request, res: Response) => {
  try {
    const types = ATOMIC_TYPES.map(type => ({
      id: type,
      label: {
        metric: 'مقياس',
        sparkline: 'رسم بياني',
        progress: 'تقدم',
        donut: 'دائري',
        status: 'حالة',
        gauge: 'مقياس'
      }[type],
      labelEn: type.charAt(0).toUpperCase() + type.slice(1)
    }));

    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch widget types',
      errorAr: 'فشل في جلب أنواع المؤشرات'
    });
  }
};
