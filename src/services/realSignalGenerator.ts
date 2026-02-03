/**
 * Real Signal Generator - توليد إشارات من بيانات حقيقية
 * يولد إشارات استثمارية بناءً على تحليل البيانات الفعلية من البوابة الوطنية
 */

import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

interface SignalData {
  type: 'OPPORTUNITY' | 'RISK' | 'TREND' | 'ALERT';
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  impactScore: number;
  confidence: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  region?: string;
  sector?: string;
  relatedDatasets: string[];
  indicators: Record<string, unknown>;
}

interface InsightData {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  category: string;
}

interface AnalysisResult {
  signals: SignalData[];
  insights: InsightData[];
  summary: string;
  summaryAr: string;
}

// تصنيفات القطاعات بالعربي والإنجليزي
const SECTOR_MAP: Record<string, { ar: string; en: string }> = {
  'العقار': { ar: 'العقارات', en: 'Real Estate' },
  'الصكوك': { ar: 'العقارات', en: 'Real Estate' },
  'الاقتصاد': { ar: 'الاقتصاد', en: 'Economy' },
  'المالية': { ar: 'المالية', en: 'Finance' },
  'الصحة': { ar: 'الصحة', en: 'Healthcare' },
  'التعليم': { ar: 'التعليم', en: 'Education' },
  'السياحة': { ar: 'السياحة', en: 'Tourism' },
  'النقل': { ar: 'النقل', en: 'Transportation' },
  'الطاقة': { ar: 'الطاقة', en: 'Energy' },
  'البيئة': { ar: 'البيئة', en: 'Environment' },
  'التجارة': { ar: 'التجارة', en: 'Commerce' },
  'الصناعة': { ar: 'الصناعة', en: 'Industry' },
  'الزراعة': { ar: 'الزراعة', en: 'Agriculture' },
  'العمل': { ar: 'سوق العمل', en: 'Labor Market' },
  'الإسكان': { ar: 'الإسكان', en: 'Housing' },
};

/**
 * توليد إشارات من بيانات حقيقية
 */
export async function generateRealSignals(): Promise<AnalysisResult> {
  logger.info('Starting real signal generation from actual data...');

  const signals: SignalData[] = [];
  const insights: InsightData[] = [];

  try {
    // 1. جلب إحصائيات الـ datasets حسب التصنيف
    logger.info('[generateRealSignals] Fetching category stats...');
    const categoryStats = await prisma.dataset.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    logger.info(`[generateRealSignals] Found ${categoryStats.length} categories`);

    // 2. جلب datasets المحدثة مؤخراً (آخر 7 أيام)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentDatasets = await prisma.dataset.findMany({
      where: {
        lastSyncAt: { gte: oneWeekAgo },
      },
      orderBy: { lastSyncAt: 'desc' },
      take: 50,
    });

    // 3. جلب إجمالي الـ datasets
    const totalDatasets = await prisma.dataset.count();

    // 4. جلب datasets بأكبر عدد سجلات
    const largestDatasets = await prisma.dataset.findMany({
      where: {
        recordCount: { gt: 0 },
      },
      orderBy: { recordCount: 'desc' },
      take: 10,
    });

    // 5. جلب datasets حسب حالة المزامنة
    const syncStats = await prisma.dataset.groupBy({
      by: ['syncStatus'],
      _count: { id: true },
    });

    // 6. جلب القطاعات ذات البيانات القليلة (للمخاطر)
    const lowDataCategories = categoryStats.filter(c => c._count.id < 10);

    // 7. جلب datasets التي فشلت مزامنتها
    const failedSync = syncStats.find(s => s.syncStatus === 'FAILED');
    const pendingSync = syncStats.find(s => s.syncStatus === 'PENDING');

    // 8. جلب datasets القديمة (لم تُحدث منذ شهر)
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const outdatedDatasets = await prisma.dataset.count({
      where: {
        OR: [
          { lastSyncAt: { lt: oneMonthAgo } },
          { lastSyncAt: null },
        ],
      },
    });

    // ═══════════════════════════════════════════════════════════════
    // توليد الإشارات
    // ═══════════════════════════════════════════════════════════════

    // إشارة 1: أكثر القطاعات نشاطاً
    if (categoryStats.length > 0) {
      const topCategory = categoryStats[0];
      const sectorInfo = SECTOR_MAP[topCategory.category] || {
        ar: topCategory.category,
        en: topCategory.category
      };

      signals.push({
        type: 'TREND',
        title: `${sectorInfo.en} Sector Leads with ${topCategory._count.id} Datasets`,
        titleAr: `قطاع ${sectorInfo.ar} يتصدر بـ ${topCategory._count.id} مجموعة بيانات`,
        summary: `The ${sectorInfo.en} sector has the highest number of datasets (${topCategory._count.id}), indicating strong data availability for investment analysis.`,
        summaryAr: `يمتلك قطاع ${sectorInfo.ar} أكبر عدد من مجموعات البيانات (${topCategory._count.id})، مما يشير إلى توفر بيانات قوية للتحليل الاستثماري.`,
        impactScore: Math.min(85, 50 + topCategory._count.id),
        confidence: 95,
        trend: 'UP',
        sector: sectorInfo.en,
        region: 'National',
        relatedDatasets: [],
        indicators: {
          datasetCount: topCategory._count.id,
          category: topCategory.category,
        },
      });
    }

    // إشارة 2: البيانات الجديدة هذا الأسبوع
    if (recentDatasets.length > 0) {
      const categories = [...new Set(recentDatasets.map(d => d.category))];

      signals.push({
        type: 'OPPORTUNITY',
        title: `${recentDatasets.length} New Datasets Updated This Week`,
        titleAr: `${recentDatasets.length} مجموعة بيانات جديدة هذا الأسبوع`,
        summary: `${recentDatasets.length} datasets have been updated in the past week across ${categories.length} sectors: ${categories.slice(0, 3).join(', ')}. Fresh data provides new investment insights.`,
        summaryAr: `تم تحديث ${recentDatasets.length} مجموعة بيانات خلال الأسبوع الماضي في ${categories.length} قطاعات: ${categories.slice(0, 3).join('، ')}. البيانات الحديثة توفر رؤى استثمارية جديدة.`,
        impactScore: Math.min(80, 40 + recentDatasets.length * 2),
        confidence: 98,
        trend: 'UP',
        region: 'National',
        relatedDatasets: recentDatasets.slice(0, 5).map(d => d.id),
        indicators: {
          newDatasets: recentDatasets.length,
          sectorsAffected: categories.length,
          topSectors: categories.slice(0, 3),
        },
      });
    }

    // إشارة 3: أكبر مجموعات البيانات
    if (largestDatasets.length > 0) {
      const topDataset = largestDatasets[0];
      const sectorInfo = SECTOR_MAP[topDataset.category] || {
        ar: topDataset.category,
        en: topDataset.category
      };

      signals.push({
        type: 'ALERT',
        title: `Major Dataset: ${topDataset.recordCount?.toLocaleString()} Records Available`,
        titleAr: `مجموعة بيانات ضخمة: ${topDataset.recordCount?.toLocaleString()} سجل متاح`,
        summary: `"${topDataset.name}" contains ${topDataset.recordCount?.toLocaleString()} records in the ${sectorInfo.en} sector. This comprehensive dataset enables detailed market analysis.`,
        summaryAr: `"${topDataset.nameAr}" تحتوي على ${topDataset.recordCount?.toLocaleString()} سجل في قطاع ${sectorInfo.ar}. هذه المجموعة الشاملة تمكّن من تحليل السوق التفصيلي.`,
        impactScore: Math.min(90, 60 + Math.floor((topDataset.recordCount || 0) / 1000)),
        confidence: 99,
        trend: 'STABLE',
        sector: sectorInfo.en,
        region: 'National',
        relatedDatasets: [topDataset.id],
        indicators: {
          datasetId: topDataset.id,
          datasetName: topDataset.name,
          recordCount: topDataset.recordCount,
          category: topDataset.category,
        },
      });
    }

    // إشارة 4: تنوع القطاعات المتاحة
    if (categoryStats.length >= 3) {
      signals.push({
        type: 'OPPORTUNITY',
        title: `Diverse Investment Data: ${categoryStats.length} Sectors Available`,
        titleAr: `بيانات استثمارية متنوعة: ${categoryStats.length} قطاع متاح`,
        summary: `The platform provides data across ${categoryStats.length} different sectors, enabling cross-sector investment analysis and portfolio diversification strategies.`,
        summaryAr: `توفر المنصة بيانات عبر ${categoryStats.length} قطاع مختلف، مما يتيح تحليل الاستثمار عبر القطاعات واستراتيجيات تنويع المحفظة.`,
        impactScore: 70,
        confidence: 100,
        trend: 'STABLE',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          totalSectors: categoryStats.length,
          topSectors: categoryStats.slice(0, 5).map(c => c.category),
          totalDatasets: totalDatasets,
        },
      });
    }

    // إشارة 5: نجاح المزامنة
    const successSync = syncStats.find(s => s.syncStatus === 'SUCCESS');
    const totalSynced = successSync?._count.id || 0;

    if (totalSynced > 0) {
      signals.push({
        type: 'TREND',
        title: `${totalSynced} Datasets Successfully Synchronized`,
        titleAr: `${totalSynced} مجموعة بيانات تمت مزامنتها بنجاح`,
        summary: `${totalSynced} out of ${totalDatasets} datasets (${Math.round(totalSynced / totalDatasets * 100)}%) are fully synchronized with the Saudi Open Data Portal, ensuring data accuracy and reliability.`,
        summaryAr: `${totalSynced} من أصل ${totalDatasets} مجموعة بيانات (${Math.round(totalSynced / totalDatasets * 100)}%) متزامنة بالكامل مع البوابة الوطنية للبيانات المفتوحة، مما يضمن دقة وموثوقية البيانات.`,
        impactScore: 65,
        confidence: 100,
        trend: 'UP',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          syncedCount: totalSynced,
          totalCount: totalDatasets,
          syncRate: Math.round(totalSynced / totalDatasets * 100),
        },
      });
    }

    // إشارة 6: تحليل القطاعات الثانوية
    if (categoryStats.length >= 2) {
      const secondCategory = categoryStats[1];
      const sectorInfo = SECTOR_MAP[secondCategory.category] || {
        ar: secondCategory.category,
        en: secondCategory.category
      };

      signals.push({
        type: 'TREND',
        title: `${sectorInfo.en} Sector: ${secondCategory._count.id} Datasets Available`,
        titleAr: `قطاع ${sectorInfo.ar}: ${secondCategory._count.id} مجموعة بيانات متاحة`,
        summary: `The ${sectorInfo.en} sector ranks second with ${secondCategory._count.id} datasets, presenting investment research opportunities.`,
        summaryAr: `يحتل قطاع ${sectorInfo.ar} المرتبة الثانية بـ ${secondCategory._count.id} مجموعة بيانات، مما يقدم فرص بحث استثمارية.`,
        impactScore: Math.min(75, 45 + secondCategory._count.id),
        confidence: 95,
        trend: 'STABLE',
        sector: sectorInfo.en,
        region: 'National',
        relatedDatasets: [],
        indicators: {
          datasetCount: secondCategory._count.id,
          category: secondCategory.category,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // إشارات المخاطر (RISK Signals)
    // ═══════════════════════════════════════════════════════════════

    // إشارة مخاطر 1: البيانات القديمة
    if (outdatedDatasets > 0) {
      const outdatedPercent = Math.round((outdatedDatasets / totalDatasets) * 100);
      signals.push({
        type: 'RISK',
        title: `${outdatedDatasets.toLocaleString()} Datasets Need Refresh`,
        titleAr: `${outdatedDatasets.toLocaleString()} مجموعة بيانات تحتاج تحديث`,
        summary: `${outdatedPercent}% of datasets (${outdatedDatasets.toLocaleString()}) haven't been updated in over 30 days. Outdated data may lead to inaccurate investment decisions.`,
        summaryAr: `${outdatedPercent}% من مجموعات البيانات (${outdatedDatasets.toLocaleString()}) لم يتم تحديثها منذ أكثر من 30 يوم. البيانات القديمة قد تؤدي لقرارات استثمارية غير دقيقة.`,
        impactScore: Math.min(80, 50 + outdatedPercent),
        confidence: 95,
        trend: 'DOWN',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          outdatedCount: outdatedDatasets,
          totalDatasets: totalDatasets,
          outdatedPercent: outdatedPercent,
        },
      });
    }

    // إشارة مخاطر 2: فشل المزامنة
    if (failedSync && failedSync._count.id > 0) {
      signals.push({
        type: 'RISK',
        title: `${failedSync._count.id} Datasets Failed to Sync`,
        titleAr: `${failedSync._count.id} مجموعة بيانات فشلت في المزامنة`,
        summary: `${failedSync._count.id} datasets failed synchronization with the Saudi Open Data Portal. This may affect data completeness and accuracy for certain sectors.`,
        summaryAr: `${failedSync._count.id} مجموعة بيانات فشلت في المزامنة مع البوابة الوطنية للبيانات المفتوحة. هذا قد يؤثر على اكتمال ودقة البيانات في بعض القطاعات.`,
        impactScore: Math.min(75, 40 + failedSync._count.id * 2),
        confidence: 100,
        trend: 'DOWN',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          failedCount: failedSync._count.id,
          syncStatus: 'FAILED',
        },
      });
    }

    // إشارة مخاطر 3: قطاعات ذات بيانات محدودة
    if (lowDataCategories.length > 0) {
      const lowDataSectors = lowDataCategories.slice(0, 3).map(c => c.category);
      signals.push({
        type: 'RISK',
        title: `${lowDataCategories.length} Sectors Have Limited Data`,
        titleAr: `${lowDataCategories.length} قطاع لديه بيانات محدودة`,
        summary: `${lowDataCategories.length} sectors have fewer than 10 datasets each, including: ${lowDataSectors.join(', ')}. Limited data increases investment analysis uncertainty.`,
        summaryAr: `${lowDataCategories.length} قطاع لديه أقل من 10 مجموعات بيانات، منها: ${lowDataSectors.join('، ')}. البيانات المحدودة تزيد من عدم اليقين في التحليل الاستثماري.`,
        impactScore: Math.min(70, 35 + lowDataCategories.length * 3),
        confidence: 90,
        trend: 'STABLE',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          lowDataSectorsCount: lowDataCategories.length,
          affectedSectors: lowDataSectors,
        },
      });
    }

    // إشارة مخاطر 4: بيانات معلقة
    if (pendingSync && pendingSync._count.id > 100) {
      signals.push({
        type: 'RISK',
        title: `${pendingSync._count.id.toLocaleString()} Datasets Pending Sync`,
        titleAr: `${pendingSync._count.id.toLocaleString()} مجموعة بيانات في انتظار المزامنة`,
        summary: `A large number of datasets (${pendingSync._count.id.toLocaleString()}) are waiting to be synchronized. Recent market data may not be fully reflected in current analysis.`,
        summaryAr: `عدد كبير من مجموعات البيانات (${pendingSync._count.id.toLocaleString()}) في انتظار المزامنة. بيانات السوق الحديثة قد لا تنعكس بالكامل في التحليل الحالي.`,
        impactScore: 65,
        confidence: 100,
        trend: 'STABLE',
        region: 'National',
        relatedDatasets: [],
        indicators: {
          pendingCount: pendingSync._count.id,
          syncStatus: 'PENDING',
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // توليد الرؤى (Insights)
    // ═══════════════════════════════════════════════════════════════

    insights.push({
      title: 'Saudi Open Data Integration',
      titleAr: 'تكامل البيانات المفتوحة السعودية',
      description: `The platform is integrated with ${totalDatasets} datasets from the Saudi National Open Data Portal, providing comprehensive coverage of the Saudi economy.`,
      descriptionAr: `المنصة متكاملة مع ${totalDatasets} مجموعة بيانات من البوابة الوطنية للبيانات المفتوحة السعودية، مما يوفر تغطية شاملة للاقتصاد السعودي.`,
      category: 'Data Coverage',
    });

    if (categoryStats.length > 0) {
      insights.push({
        title: 'Multi-Sector Analysis Capability',
        titleAr: 'قدرة التحليل متعدد القطاعات',
        description: `Data available across ${categoryStats.length} sectors enables comprehensive cross-sector investment analysis and correlation studies.`,
        descriptionAr: `البيانات المتاحة عبر ${categoryStats.length} قطاع تمكّن من تحليل الاستثمار الشامل عبر القطاعات ودراسات الارتباط.`,
        category: 'Investment Research',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // الملخص
    // ═══════════════════════════════════════════════════════════════

    const summary = `Market analysis based on ${totalDatasets} real datasets from the Saudi Open Data Portal. ${categoryStats.length} sectors covered with ${recentDatasets.length} recent updates. Data-driven investment signals generated from authentic government sources.`;

    const summaryAr = `تحليل السوق بناءً على ${totalDatasets} مجموعة بيانات حقيقية من البوابة الوطنية للبيانات المفتوحة السعودية. ${categoryStats.length} قطاع مغطى مع ${recentDatasets.length} تحديثات حديثة. إشارات استثمارية مبنية على مصادر حكومية موثوقة.`;

    logger.info(`Real signal generation complete. Generated ${signals.length} signals from actual data.`);

    return {
      signals,
      insights,
      summary,
      summaryAr,
    };

  } catch (error) {
    logger.error('Error generating real signals:', error);

    // في حالة الخطأ، نرجع نتيجة فارغة (وليس بيانات وهمية)
    return {
      signals: [],
      insights: [],
      summary: 'Unable to generate signals. Please try again later.',
      summaryAr: 'تعذر توليد الإشارات. يرجى المحاولة لاحقاً.',
    };
  }
}

/**
 * حفظ الإشارات في قاعدة البيانات
 */
export async function saveRealSignals(signals: SignalData[]): Promise<number> {
  let savedCount = 0;

  for (const signal of signals) {
    try {
      await prisma.signal.create({
        data: {
          type: signal.type,
          title: signal.title,
          titleAr: signal.titleAr,
          summary: signal.summary,
          summaryAr: signal.summaryAr,
          impactScore: signal.impactScore,
          confidence: signal.confidence,
          trend: signal.trend,
          region: signal.region,
          sector: signal.sector,
          dataSource: 'REAL_DATA_ANALYSIS',
          details: JSON.stringify({
            relatedDatasets: signal.relatedDatasets,
            indicators: signal.indicators,
          }),
          isActive: true,
        },
      });
      savedCount++;
    } catch (error) {
      logger.error(`Error saving signal: ${signal.title}`, error);
    }
  }

  logger.info(`Saved ${savedCount} real signals to database`);
  return savedCount;
}

/**
 * توليد وحفظ الإشارات الحقيقية
 */
export async function generateAndSaveRealSignals(): Promise<AnalysisResult> {
  const result = await generateRealSignals();

  if (result.signals.length > 0) {
    // حذف كل الإشارات القديمة من REAL_DATA_ANALYSIS لتجنب التكرار
    const deleted = await prisma.signal.deleteMany({
      where: {
        dataSource: 'REAL_DATA_ANALYSIS',
      },
    });
    logger.info(`Deleted ${deleted.count} old REAL_DATA_ANALYSIS signals`);

    await saveRealSignals(result.signals);
  }

  return result;
}

export default {
  generateRealSignals,
  saveRealSignals,
  generateAndSaveRealSignals,
};
