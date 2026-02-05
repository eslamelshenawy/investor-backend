/**
 * Dashboard Templates Controller - قوالب اللوحات
 * Predefined dashboard templates that users can clone
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError } from '../utils/response.js';

interface WidgetConfig {
  type: string;
  title: string;
  titleAr: string;
  dataSource: string;
  chartType?: string;
  size: 'sm' | 'md' | 'lg';
}

interface DashboardTemplate {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  category: string;
  icon: string;
  widgets: WidgetConfig[];
  layout: Record<string, unknown>;
}

const TEMPLATES: DashboardTemplate[] = [
  {
    id: 'macro-economy',
    name: 'Macro Economy Overview',
    nameAr: 'نظرة عامة على الاقتصاد الكلي',
    description: 'Key macroeconomic indicators at a glance',
    descriptionAr: 'المؤشرات الاقتصادية الكلية الرئيسية في نظرة واحدة',
    category: 'economy',
    icon: 'TrendingUp',
    widgets: [
      { type: 'metric', title: 'GDP Growth', titleAr: 'نمو الناتج المحلي', dataSource: 'signals', size: 'sm' },
      { type: 'chart', title: 'Inflation Rate', titleAr: 'معدل التضخم', dataSource: 'signals', chartType: 'line', size: 'md' },
      { type: 'metric', title: 'Unemployment Rate', titleAr: 'معدل البطالة', dataSource: 'signals', size: 'sm' },
      { type: 'chart', title: 'Trade Balance', titleAr: 'الميزان التجاري', dataSource: 'datasets', chartType: 'bar', size: 'lg' },
    ],
    layout: { columns: 2, gap: 16 },
  },
  {
    id: 'real-estate',
    name: 'Real Estate Market',
    nameAr: 'سوق العقار',
    description: 'Real estate market trends and indicators',
    descriptionAr: 'اتجاهات ومؤشرات سوق العقار',
    category: 'real_estate',
    icon: 'Building',
    widgets: [
      { type: 'metric', title: 'Property Index', titleAr: 'مؤشر العقار', dataSource: 'signals', size: 'sm' },
      { type: 'chart', title: 'Price Trends', titleAr: 'اتجاهات الأسعار', dataSource: 'datasets', chartType: 'line', size: 'lg' },
      { type: 'metric', title: 'Transactions', titleAr: 'الصفقات', dataSource: 'datasets', size: 'sm' },
      { type: 'chart', title: 'Regional Distribution', titleAr: 'التوزيع الجغرافي', dataSource: 'datasets', chartType: 'pie', size: 'md' },
    ],
    layout: { columns: 2, gap: 16 },
  },
  {
    id: 'investment-signals',
    name: 'Investment Signals',
    nameAr: 'إشارات الاستثمار',
    description: 'Active investment signals and AI analysis',
    descriptionAr: 'إشارات الاستثمار النشطة وتحليلات الذكاء الاصطناعي',
    category: 'investment',
    icon: 'Zap',
    widgets: [
      { type: 'metric', title: 'Active Signals', titleAr: 'الإشارات النشطة', dataSource: 'signals', size: 'sm' },
      { type: 'list', title: 'Latest Signals', titleAr: 'آخر الإشارات', dataSource: 'signals', size: 'lg' },
      { type: 'chart', title: 'Signal Trends', titleAr: 'اتجاه الإشارات', dataSource: 'signals', chartType: 'area', size: 'md' },
      { type: 'metric', title: 'Avg Confidence', titleAr: 'متوسط الثقة', dataSource: 'signals', size: 'sm' },
    ],
    layout: { columns: 2, gap: 16 },
  },
  {
    id: 'energy-sector',
    name: 'Energy Sector',
    nameAr: 'قطاع الطاقة',
    description: 'Energy production and consumption metrics',
    descriptionAr: 'مقاييس إنتاج واستهلاك الطاقة',
    category: 'energy',
    icon: 'Flame',
    widgets: [
      { type: 'metric', title: 'Oil Production', titleAr: 'إنتاج النفط', dataSource: 'datasets', size: 'sm' },
      { type: 'chart', title: 'Energy Mix', titleAr: 'مزيج الطاقة', dataSource: 'datasets', chartType: 'donut', size: 'md' },
      { type: 'chart', title: 'Price History', titleAr: 'تاريخ الأسعار', dataSource: 'datasets', chartType: 'line', size: 'lg' },
      { type: 'metric', title: 'Renewable %', titleAr: '% المتجددة', dataSource: 'signals', size: 'sm' },
    ],
    layout: { columns: 2, gap: 16 },
  },
  {
    id: 'labor-market',
    name: 'Labor Market',
    nameAr: 'سوق العمل',
    description: 'Employment and labor market statistics',
    descriptionAr: 'إحصائيات التوظيف وسوق العمل',
    category: 'labor',
    icon: 'Users',
    widgets: [
      { type: 'metric', title: 'Employment Rate', titleAr: 'معدل التوظيف', dataSource: 'signals', size: 'sm' },
      { type: 'chart', title: 'Sector Distribution', titleAr: 'توزيع القطاعات', dataSource: 'datasets', chartType: 'bar', size: 'lg' },
      { type: 'metric', title: 'Saudization', titleAr: 'التوطين', dataSource: 'signals', size: 'sm' },
      { type: 'chart', title: 'Wage Trends', titleAr: 'اتجاهات الأجور', dataSource: 'datasets', chartType: 'line', size: 'md' },
    ],
    layout: { columns: 2, gap: 16 },
  },
  {
    id: 'budget-fiscal',
    name: 'Budget & Fiscal',
    nameAr: 'الميزانية والمالية',
    description: 'Government budget and fiscal indicators',
    descriptionAr: 'مؤشرات الميزانية الحكومية والمالية العامة',
    category: 'budget',
    icon: 'Banknote',
    widgets: [
      { type: 'metric', title: 'Revenue', titleAr: 'الإيرادات', dataSource: 'datasets', size: 'sm' },
      { type: 'metric', title: 'Expenditure', titleAr: 'المصروفات', dataSource: 'datasets', size: 'sm' },
      { type: 'chart', title: 'Budget Balance', titleAr: 'رصيد الميزانية', dataSource: 'datasets', chartType: 'bar', size: 'lg' },
      { type: 'chart', title: 'Revenue Sources', titleAr: 'مصادر الإيرادات', dataSource: 'datasets', chartType: 'pie', size: 'md' },
    ],
    layout: { columns: 2, gap: 16 },
  },
];

export async function getTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const templates = TEMPLATES.map(({ widgets, layout, ...rest }) => ({
      ...rest,
      widgetCount: widgets.length,
    }));

    sendSuccess(res, templates);
  } catch (error) {
    next(error);
  }
}

export async function getTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const template = TEMPLATES.find((t) => t.id === id);

    if (!template) {
      sendError(res, 'Template not found', 'القالب غير موجود', 404);
      return;
    }

    sendSuccess(res, template);
  } catch (error) {
    next(error);
  }
}

export async function cloneTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const template = TEMPLATES.find((t) => t.id === id);

    if (!template) {
      sendError(res, 'Template not found', 'القالب غير موجود', 404);
      return;
    }

    // Create user dashboard from template
    const dashboard = await prisma.dashboard.create({
      data: {
        userId: req.user!.userId,
        name: template.nameAr,
        nameAr: template.nameAr,
        description: template.descriptionAr,
        widgets: JSON.stringify(template.widgets),
        layout: JSON.stringify(template.layout),
      },
    });

    sendSuccess(res, dashboard, 201);
  } catch (error) {
    next(error);
  }
}

export default { getTemplates, getTemplate, cloneTemplate };
