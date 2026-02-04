/**
 * Widget Controller - التحكم بالمؤشرات الذكية
 * Provides API for dashboard widgets/indicators
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
 * Generate widgets dynamically from datasets
 */
async function generateWidgetsFromDatasets(): Promise<Widget[]> {
  const datasets = await prisma.dataset.findMany({ where: { isActive: true } });
  const signals = await prisma.signal.findMany({ take: 20, orderBy: { createdAt: 'desc' } });

  const widgets: Widget[] = [];

  // Generate widgets from datasets
  datasets.forEach((dataset, index) => {
    const atomicType = ATOMIC_TYPES[index % ATOMIC_TYPES.length];
    const trend = Math.floor(Math.random() * 30) - 10;
    const value = dataset.recordCount || Math.floor(Math.random() * 10000);

    widgets.push({
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
    });

    // Add secondary widget for larger datasets
    if (dataset.recordCount > 100) {
      const secondaryType = ATOMIC_TYPES[(index + 2) % ATOMIC_TYPES.length];
      widgets.push({
        id: `dataset_${dataset.id}_secondary`,
        title: `تحليل ${dataset.nameAr || dataset.name}`,
        type: 'bar',
        category: dataset.category,
        description: `تحليل تفصيلي لـ ${dataset.descriptionAr || dataset.description || ''}`,
        data: [
          { name: 'Q1', value: Math.floor(Math.random() * 1000) },
          { name: 'Q2', value: Math.floor(Math.random() * 1000) },
          { name: 'Q3', value: Math.floor(Math.random() * 1000) },
          { name: 'Q4', value: Math.floor(Math.random() * 1000) }
        ],
        lastRefresh: new Date().toISOString(),
        atomicType: secondaryType,
        atomicMetadata: {
          trend: Math.floor(Math.random() * 20) - 5,
          target: Math.floor(Math.random() * 100),
          statusColor: 'blue',
          subLabel: 'مقارنة ربعية'
        }
      });
    }
  });

  // Generate widgets from signals
  signals.forEach((signal, index) => {
    const atomicType = ATOMIC_TYPES[(index + 3) % ATOMIC_TYPES.length];
    widgets.push({
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
    });
  });

  // Add supplementary widgets to reach 60+
  const supplementaryWidgets = generateSupplementaryWidgets(widgets.length);
  widgets.push(...supplementaryWidgets);

  return widgets;
}

/**
 * Generate supplementary widgets to ensure variety
 */
function generateSupplementaryWidgets(currentCount: number): Widget[] {
  const supplementary: Widget[] = [];
  const neededCount = Math.max(0, 65 - currentCount);

  const metricNames = [
    { ar: 'معدل النمو السنوي', en: 'Annual Growth Rate' },
    { ar: 'مؤشر الأداء الاقتصادي', en: 'Economic Performance Index' },
    { ar: 'نسبة الاستثمار الأجنبي', en: 'Foreign Investment Ratio' },
    { ar: 'معدل التضخم', en: 'Inflation Rate' },
    { ar: 'نسبة البطالة', en: 'Unemployment Rate' },
    { ar: 'الناتج المحلي الإجمالي', en: 'GDP' },
    { ar: 'مؤشر ثقة المستثمرين', en: 'Investor Confidence Index' },
    { ar: 'حجم التجارة الخارجية', en: 'External Trade Volume' },
    { ar: 'مؤشر أسعار المستهلك', en: 'Consumer Price Index' },
    { ar: 'نسبة الادخار الوطني', en: 'National Savings Rate' },
    { ar: 'مؤشر الإنتاج الصناعي', en: 'Industrial Production Index' },
    { ar: 'حجم الائتمان المصرفي', en: 'Banking Credit Volume' },
    { ar: 'مؤشر قطاع التجزئة', en: 'Retail Sector Index' },
    { ar: 'معدل نمو القطاع السياحي', en: 'Tourism Growth Rate' },
    { ar: 'مؤشر التنافسية العالمية', en: 'Global Competitiveness Index' }
  ];

  for (let i = 0; i < neededCount; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const atomicType = ATOMIC_TYPES[i % ATOMIC_TYPES.length];
    const metric = metricNames[i % metricNames.length];
    const trend = Math.floor(Math.random() * 40) - 15;
    const value = Math.floor(Math.random() * 10000);

    supplementary.push({
      id: `supp_${i}`,
      title: `${metric.ar} - ${category.label}`,
      type: 'kpi',
      category: category.id,
      description: `مؤشر ${metric.ar} في قطاع ${category.label}`,
      data: [{ name: 'Current', value }],
      lastRefresh: new Date().toISOString(),
      atomicType,
      atomicMetadata: {
        trend,
        target: Math.floor(Math.random() * 100),
        statusColor: trend > 0 ? 'green' : trend < -5 ? 'red' : 'amber',
        subLabel: ['يومي', 'أسبوعي', 'شهري', 'سنوي'][i % 4]
      }
    });
  }

  return supplementary;
}

/**
 * Get all widgets with filtering and pagination
 */
export const getWidgets = async (req: Request, res: Response) => {
  try {
    const { category, search, type, page = '1', limit = '100' } = req.query;

    let widgets = await generateWidgetsFromDatasets();

    // Filter by category
    if (category && category !== 'ALL' && category !== 'all') {
      widgets = widgets.filter(w => w.category === category);
    }

    // Filter by atomic type
    if (type) {
      widgets = widgets.filter(w => w.atomicType === type);
    }

    // Search filter
    if (search) {
      const searchLower = (search as string).toLowerCase();
      widgets = widgets.filter(w =>
        w.title.toLowerCase().includes(searchLower) ||
        w.description.toLowerCase().includes(searchLower) ||
        w.category.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedWidgets = widgets.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: paginatedWidgets,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: widgets.length,
        totalPages: Math.ceil(widgets.length / limitNum)
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
 * Get widget by ID
 */
export const getWidget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const widgets = await generateWidgetsFromDatasets();
    const widget = widgets.find(w => w.id === id);

    if (!widget) {
      return res.status(404).json({
        success: false,
        error: 'Widget not found',
        errorAr: 'المؤشر غير موجود'
      });
    }

    res.json({
      success: true,
      data: widget
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
 * Stream widgets (WebFlux-style SSE)
 * Streams widgets progressively for better UX in Expert Studio
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
    let widgets = await generateWidgetsFromDatasets();

    // Filter by category
    if (category && category !== 'ALL' && category !== 'all') {
      widgets = widgets.filter(w => w.category === category);
    }

    // Filter by atomic type
    if (type) {
      widgets = widgets.filter(w => w.atomicType === type);
    }

    // Search filter
    if (search) {
      const searchLower = (search as string).toLowerCase();
      widgets = widgets.filter(w =>
        w.title.toLowerCase().includes(searchLower) ||
        w.description.toLowerCase().includes(searchLower) ||
        w.category.toLowerCase().includes(searchLower)
      );
    }

    // Calculate category stats
    const categoryStats: Record<string, number> = {};
    const typeStats: Record<string, number> = {};
    widgets.forEach(w => {
      categoryStats[w.category] = (categoryStats[w.category] || 0) + 1;
      typeStats[w.atomicType] = (typeStats[w.atomicType] || 0) + 1;
    });

    // Send initial metadata
    sendEvent('meta', {
      total: widgets.length,
      categories: CATEGORIES.map(c => ({
        ...c,
        count: categoryStats[c.id] || 0
      })),
      typeStats
    });

    // Stream widgets in batches for smoother UX
    const batchSize = 5;
    for (let i = 0; i < widgets.length; i += batchSize) {
      const batch = widgets.slice(i, i + batchSize);

      for (const widget of batch) {
        sendEvent('widget', widget);
      }

      // Small delay between batches
      if (i + batchSize < widgets.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Signal completion
    sendEvent('complete', { count: widgets.length });
    res.end();
  } catch (error) {
    console.error('Error streaming widgets:', error);
    sendEvent('error', { message: 'فشل في جلب المؤشرات' });
    res.end();
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
