/**
 * Dashboard Controller - وحدة تحكم اللوحات
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';

// Dashboard categories
const DASHBOARD_CATEGORIES = [
  { id: 'all', label: 'الكل', labelEn: 'All' },
  { id: 'economy', label: 'الاقتصاد الكلي', labelEn: 'Economy' },
  { id: 'energy', label: 'الطاقة والتعدين', labelEn: 'Energy & Mining' },
  { id: 'real_estate', label: 'العقار والإسكان', labelEn: 'Real Estate' },
  { id: 'investment', label: 'الاستثمار', labelEn: 'Investment' },
  { id: 'labor', label: 'سوق العمل', labelEn: 'Labor Market' },
  { id: 'tourism', label: 'السياحة', labelEn: 'Tourism' },
  { id: 'technology', label: 'التقنية', labelEn: 'Technology' },
];

// Generate dashboards from datasets
async function generateDashboardsFromDatasets() {
  const datasets = await prisma.dataset.findMany({
    where: { isActive: true },
    orderBy: { lastSyncAt: 'desc' },
  });

  const categoryMap: Record<string, string> = {
    'عقارات': 'real_estate',
    'تمويل': 'investment',
    'استثمار': 'investment',
    'إحصائيات': 'economy',
    'قانونية': 'economy',
  };

  const colors = ['blue', 'green', 'purple', 'amber', 'rose', 'cyan', 'indigo', 'teal'];
  const dataFreqs = ['daily', 'monthly', 'quarterly', 'yearly'];

  return datasets.map((dataset, index) => ({
    id: `dash_${dataset.id}`,
    name: dataset.nameAr || dataset.name,
    nameEn: dataset.name,
    description: dataset.descriptionAr || dataset.description || `لوحة بيانات ${dataset.nameAr}`,
    category: categoryMap[dataset.category] || 'economy',
    source: 'البيانات المفتوحة السعودية',
    widgets: [],
    views: Math.floor(Math.random() * 50000) + 1000,
    lastUpdated: dataset.lastSyncAt ? formatTimeAgo(dataset.lastSyncAt) : 'غير محدث',
    isFavorite: false,
    color: colors[index % colors.length],
    trend: Math.floor(Math.random() * 30) - 5,
    keyMetrics: generateKeyMetrics(dataset.category),
    dataFreq: dataFreqs[Math.floor(Math.random() * dataFreqs.length)],
    datasetId: dataset.id,
    recordCount: dataset.recordCount || 0,
    syncStatus: dataset.syncStatus,
  }));
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'منذ دقائق';
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return 'منذ يوم';
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
}

function generateKeyMetrics(category: string): string[] {
  const metricsMap: Record<string, string[]> = {
    'عقارات': ['عدد الصفقات', 'متوسط السعر', 'مؤشر النمو'],
    'تمويل': ['حجم التمويل', 'عدد المستفيدين', 'نسبة النمو'],
    'استثمار': ['حجم الاستثمار', 'عدد المشاريع', 'العائد'],
    'إحصائيات': ['المؤشر العام', 'نسبة التغير', 'المتوسط'],
    'قانونية': ['عدد القرارات', 'نسبة التنفيذ', 'المدة'],
  };
  return metricsMap[category] || ['المؤشر الرئيسي', 'نسبة التغير', 'الإجمالي'];
}

// Get all official dashboards
export async function getDashboards(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    let dashboards = await generateDashboardsFromDatasets();

    // Filter by category
    if (category && category !== 'all') {
      dashboards = dashboards.filter(d => d.category === category);
    }

    // Filter by search
    if (search) {
      const searchLower = (search as string).toLowerCase();
      dashboards = dashboards.filter(d =>
        d.name.toLowerCase().includes(searchLower) ||
        d.description.toLowerCase().includes(searchLower)
      );
    }

    // Paginate
    const total = dashboards.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedDashboards = dashboards.slice(startIndex, startIndex + limitNum);

    sendPaginated(res, paginatedDashboards, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get dashboard categories
export async function getCategories(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, DASHBOARD_CATEGORIES);
  } catch (error) {
    next(error);
  }
}

// Get single dashboard with widgets
export async function getDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const dashboards = await generateDashboardsFromDatasets();
    const dashboard = dashboards.find(d => d.id === id);

    if (!dashboard) {
      res.status(404).json({
        success: false,
        error: 'Dashboard not found',
        errorAr: 'اللوحة غير موجودة',
      });
      return;
    }

    // Generate widgets for this dashboard
    const widgets = generateWidgetsForDashboard(dashboard);

    sendSuccess(res, { ...dashboard, widgets });
  } catch (error) {
    next(error);
  }
}

function generateWidgetsForDashboard(dashboard: any) {
  const widgetTypes = ['metric', 'chart', 'table', 'trend'];
  const chartTypes = ['bar', 'line', 'pie', 'area'];

  return dashboard.keyMetrics.map((metric: string, index: number) => ({
    id: `widget_${dashboard.id}_${index}`,
    title: metric,
    type: widgetTypes[index % widgetTypes.length],
    chartType: chartTypes[index % chartTypes.length],
    value: Math.floor(Math.random() * 10000),
    change: Math.floor(Math.random() * 40) - 20,
    data: generateChartData(),
  }));
}

function generateChartData() {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'];
  return months.map(month => ({
    name: month,
    value: Math.floor(Math.random() * 1000) + 100,
  }));
}

export default {
  getDashboards,
  getCategories,
  getDashboard,
};
