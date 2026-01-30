/**
 * خدمة اكتشاف Datasets جديدة - النسخة المحسنة
 * Enhanced Discovery Service - Supports ALL categories and pagination
 *
 * يدعم جلب كل الـ 15,500+ dataset من منصة البيانات المفتوحة السعودية
 */

import puppeteer from 'puppeteer-core';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface DiscoveryResult {
  total: number;
  known: number;
  newIds: string[];
  all: string[];
  byCategory?: Record<string, number>;
}

interface CategoryInfo {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
}

interface DiscoveryProgress {
  category: string;
  page: number;
  found: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io?token=';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';

const BASE_URL = 'https://open.data.gov.sa';
const DATASETS_URL = `${BASE_URL}/ar/datasets`;

// تأخير بين الطلبات لتجنب الحظر
const REQUEST_DELAY = 2000;
const PAGE_LOAD_TIMEOUT = 60000;
const MAX_SCROLL_ATTEMPTS = 100; // زيادة عدد المحاولات
const MAX_PAGES_PER_CATEGORY = 500; // أقصى عدد صفحات لكل قسم

// ═══════════════════════════════════════════════════════════════════
// قائمة كل الأقسام المتاحة في منصة البيانات المفتوحة السعودية
// All available categories on Saudi Open Data Platform
// ═══════════════════════════════════════════════════════════════════

export const SAUDI_DATA_CATEGORIES: CategoryInfo[] = [
  // الأقسام الرئيسية
  { id: 'economy', nameAr: 'الاقتصاد', nameEn: 'Economy', slug: 'economy' },
  { id: 'finance', nameAr: 'المالية', nameEn: 'Finance', slug: 'finance' },
  { id: 'health', nameAr: 'الصحة', nameEn: 'Health', slug: 'health' },
  { id: 'education', nameAr: 'التعليم', nameEn: 'Education', slug: 'education' },
  { id: 'environment', nameAr: 'البيئة', nameEn: 'Environment', slug: 'environment' },
  { id: 'labor', nameAr: 'العمل', nameEn: 'Labor', slug: 'labor' },
  { id: 'housing', nameAr: 'الإسكان', nameEn: 'Housing', slug: 'housing' },
  { id: 'real-estate', nameAr: 'العقارات', nameEn: 'Real Estate', slug: 'real-estate' },
  { id: 'transport', nameAr: 'النقل', nameEn: 'Transport', slug: 'transport' },
  { id: 'tourism', nameAr: 'السياحة', nameEn: 'Tourism', slug: 'tourism' },
  { id: 'agriculture', nameAr: 'الزراعة', nameEn: 'Agriculture', slug: 'agriculture' },
  { id: 'energy', nameAr: 'الطاقة', nameEn: 'Energy', slug: 'energy' },
  { id: 'industry', nameAr: 'الصناعة', nameEn: 'Industry', slug: 'industry' },
  { id: 'trade', nameAr: 'التجارة', nameEn: 'Trade', slug: 'trade' },
  { id: 'investment', nameAr: 'الاستثمار', nameEn: 'Investment', slug: 'investment' },
  { id: 'technology', nameAr: 'التقنية', nameEn: 'Technology', slug: 'technology' },
  { id: 'communications', nameAr: 'الاتصالات', nameEn: 'Communications', slug: 'communications' },
  { id: 'justice', nameAr: 'العدل', nameEn: 'Justice', slug: 'justice' },
  { id: 'security', nameAr: 'الأمن', nameEn: 'Security', slug: 'security' },
  { id: 'social', nameAr: 'الشؤون الاجتماعية', nameEn: 'Social Affairs', slug: 'social' },
  { id: 'culture', nameAr: 'الثقافة', nameEn: 'Culture', slug: 'culture' },
  { id: 'sports', nameAr: 'الرياضة', nameEn: 'Sports', slug: 'sports' },
  { id: 'media', nameAr: 'الإعلام', nameEn: 'Media', slug: 'media' },
  { id: 'government', nameAr: 'الحكومة', nameEn: 'Government', slug: 'government' },
  { id: 'statistics', nameAr: 'الإحصاءات', nameEn: 'Statistics', slug: 'statistics' },
  { id: 'demographics', nameAr: 'السكان', nameEn: 'Demographics', slug: 'demographics' },
  { id: 'municipalities', nameAr: 'البلديات', nameEn: 'Municipalities', slug: 'municipalities' },
  { id: 'water', nameAr: 'المياه', nameEn: 'Water', slug: 'water' },
  { id: 'electricity', nameAr: 'الكهرباء', nameEn: 'Electricity', slug: 'electricity' },
  { id: 'hajj', nameAr: 'الحج والعمرة', nameEn: 'Hajj & Umrah', slug: 'hajj' },
  { id: 'islamic-affairs', nameAr: 'الشؤون الإسلامية', nameEn: 'Islamic Affairs', slug: 'islamic-affairs' },
  { id: 'human-resources', nameAr: 'الموارد البشرية', nameEn: 'Human Resources', slug: 'human-resources' },
  { id: 'civil-service', nameAr: 'الخدمة المدنية', nameEn: 'Civil Service', slug: 'civil-service' },
  { id: 'foreign-affairs', nameAr: 'الشؤون الخارجية', nameEn: 'Foreign Affairs', slug: 'foreign-affairs' },
  { id: 'interior', nameAr: 'الداخلية', nameEn: 'Interior', slug: 'interior' },
  { id: 'defense', nameAr: 'الدفاع', nameEn: 'Defense', slug: 'defense' },
  { id: 'national-guard', nameAr: 'الحرس الوطني', nameEn: 'National Guard', slug: 'national-guard' },
  { id: 'other', nameAr: 'أخرى', nameEn: 'Other', slug: 'other' },
];

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDatasetIds(content: string): string[] {
  const idMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
  return [...new Set(idMatches.map((m) => m.replace('/datasets/view/', '')))];
}

// ═══════════════════════════════════════════════════════════════════
// Main Discovery Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * اكتشاف Datasets من صفحة واحدة مع Infinite Scroll
 */
async function discoverFromPage(
  page: puppeteer.Page,
  url: string,
  maxScrolls: number = MAX_SCROLL_ATTEMPTS
): Promise<string[]> {
  const allIds = new Set<string>();

  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PAGE_LOAD_TIMEOUT,
    });

    // Wait for initial load
    await delay(5000);

    // Extract initial IDs
    let content = await page.content();
    extractDatasetIds(content).forEach((id) => allIds.add(id));
    logger.info(`   📄 Initial load: ${allIds.size} datasets`);

    // Scroll to load more (infinite scroll)
    let previousHeight = 0;
    let scrollAttempts = 0;
    let noChangeCount = 0;
    let lastCount = allIds.size;

    while (scrollAttempts < maxScrolls && noChangeCount < 5) {
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(REQUEST_DELAY);

      // Check for new content
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      content = await page.content();
      const newIds = extractDatasetIds(content);
      newIds.forEach((id) => allIds.add(id));

      // Check if we got new data
      if (allIds.size === lastCount && currentHeight === previousHeight) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
        if (allIds.size > lastCount) {
          logger.info(`   📜 Scroll ${scrollAttempts + 1}: Found ${allIds.size} datasets (+${allIds.size - lastCount})`);
        }
      }

      lastCount = allIds.size;
      previousHeight = currentHeight;
      scrollAttempts++;

      // Try clicking "Load More" button if exists
      try {
        const loadMoreButton = await page.$('button[class*="load-more"], .load-more, [ng-click*="loadMore"]');
        if (loadMoreButton) {
          await loadMoreButton.click();
          await delay(REQUEST_DELAY);
          logger.info(`   🔘 Clicked "Load More" button`);
        }
      } catch {
        // No load more button, continue scrolling
      }
    }

    return Array.from(allIds);
  } catch (error) {
    logger.error(`   ❌ Error discovering from ${url}: ${error instanceof Error ? error.message : 'Unknown'}`);
    return Array.from(allIds);
  }
}

/**
 * اكتشاف Datasets من قسم معين
 */
async function discoverFromCategory(
  page: puppeteer.Page,
  category: CategoryInfo,
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<string[]> {
  logger.info(`\n📁 اكتشاف قسم: ${category.nameAr} (${category.nameEn})`);

  const allIds = new Set<string>();
  let pageNum = 1;

  // Try different URL patterns
  const urlPatterns = [
    `${DATASETS_URL}?category=${category.id}`,
    `${DATASETS_URL}?category=${category.slug}`,
    `${DATASETS_URL}?filter=${category.nameAr}`,
    `${DATASETS_URL}?q=${encodeURIComponent(category.nameAr)}`,
  ];

  for (const url of urlPatterns) {
    try {
      const ids = await discoverFromPage(page, url, 50);
      ids.forEach((id) => allIds.add(id));

      if (allIds.size > 0) {
        logger.info(`   ✅ Found ${allIds.size} datasets in ${category.nameAr}`);
        break;
      }
    } catch {
      continue;
    }
  }

  // Also try pagination if the site supports it
  while (pageNum <= MAX_PAGES_PER_CATEGORY) {
    const paginatedUrl = `${DATASETS_URL}?category=${category.id}&page=${pageNum}`;

    try {
      await page.goto(paginatedUrl, {
        waitUntil: 'networkidle2',
        timeout: PAGE_LOAD_TIMEOUT,
      });

      await delay(3000);
      const content = await page.content();
      const pageIds = extractDatasetIds(content);

      if (pageIds.length === 0) {
        break; // No more pages
      }

      const beforeCount = allIds.size;
      pageIds.forEach((id) => allIds.add(id));

      if (allIds.size === beforeCount) {
        break; // No new datasets
      }

      if (onProgress) {
        onProgress({
          category: category.nameAr,
          page: pageNum,
          found: pageIds.length,
          total: allIds.size,
        });
      }

      pageNum++;
      await delay(REQUEST_DELAY);
    } catch {
      break;
    }
  }

  return Array.from(allIds);
}

/**
 * اكتشاف كل الـ Datasets من كل الأقسام
 * Discover ALL datasets from ALL categories
 */
export async function discoverAllDatasets(
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<string[]> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('🔍 بدء اكتشاف شامل لكل الـ Datasets من كل الأقسام');
  logger.info(`📊 عدد الأقسام: ${SAUDI_DATA_CATEGORIES.length}`);
  logger.info('═══════════════════════════════════════════════════════');

  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN غير موجود - أضفه في Environment Variables');
    return [];
  }

  const allIds = new Set<string>();
  const categoryStats: Record<string, number> = {};
  let browser;

  try {
    logger.info('🌐 الاتصال بـ Browserless.io...');
    browser = await puppeteer.connect({
      browserWSEndpoint: `${BROWSERLESS_URL}${BROWSERLESS_TOKEN}`,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // First, discover from main page (no filters)
    logger.info('\n📄 اكتشاف الصفحة الرئيسية...');
    const mainPageIds = await discoverFromPage(page, DATASETS_URL, MAX_SCROLL_ATTEMPTS);
    mainPageIds.forEach((id) => allIds.add(id));
    categoryStats['الصفحة الرئيسية'] = mainPageIds.length;
    logger.info(`   ✅ الصفحة الرئيسية: ${mainPageIds.length} dataset`);

    // Then discover from each category
    for (const category of SAUDI_DATA_CATEGORIES) {
      try {
        const categoryIds = await discoverFromCategory(page, category, onProgress);
        const newCount = categoryIds.filter((id) => !allIds.has(id)).length;
        categoryIds.forEach((id) => allIds.add(id));
        categoryStats[category.nameAr] = newCount;

        logger.info(`   📊 ${category.nameAr}: ${categoryIds.length} (جديد: ${newCount})`);
        logger.info(`   📈 الإجمالي حتى الآن: ${allIds.size}`);

        // Delay between categories to avoid rate limiting
        await delay(REQUEST_DELAY * 2);
      } catch (error) {
        logger.error(`   ❌ خطأ في قسم ${category.nameAr}: ${error instanceof Error ? error.message : 'Unknown'}`);
        categoryStats[category.nameAr] = 0;
      }
    }

    await page.close();

    // Log final stats
    logger.info('\n═══════════════════════════════════════════════════════');
    logger.info('📊 ملخص الاكتشاف:');
    logger.info(`   📁 إجمالي الـ Datasets: ${allIds.size}`);
    logger.info('   📋 حسب القسم:');
    Object.entries(categoryStats)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        logger.info(`      • ${cat}: ${count}`);
      });
    logger.info('═══════════════════════════════════════════════════════');

    return Array.from(allIds);
  } catch (error) {
    logger.error(`❌ خطأ في الاكتشاف الشامل: ${error instanceof Error ? error.message : 'Unknown'}`);
    return Array.from(allIds);
  } finally {
    if (browser) {
      browser.disconnect();
    }
  }
}

/**
 * اكتشاف سريع - الصفحة الرئيسية فقط (للاستخدام المتكرر)
 */
export async function discoverDatasets(): Promise<string[]> {
  logger.info('🔍 بدء اكتشاف سريع (الصفحة الرئيسية فقط)...');

  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN غير موجود');
    return [];
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${BROWSERLESS_URL}${BROWSERLESS_TOKEN}`,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const ids = await discoverFromPage(page, DATASETS_URL, 50);
    await page.close();

    logger.info(`✅ تم اكتشاف ${ids.length} dataset`);
    return ids;
  } catch (error) {
    logger.error(`❌ خطأ في الاكتشاف: ${error instanceof Error ? error.message : 'Unknown'}`);
    return [];
  } finally {
    if (browser) {
      browser.disconnect();
    }
  }
}

/**
 * مقارنة الـ Datasets المكتشفة مع الموجودة في قاعدة البيانات
 */
export async function findNewDatasets(fullDiscovery: boolean = false): Promise<DiscoveryResult> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`🔍 بدء عملية اكتشاف Datasets جديدة (${fullDiscovery ? 'شامل' : 'سريع'})`);
  logger.info('═══════════════════════════════════════════════════════');

  // Get known IDs from database
  const existingDatasets = await prisma.dataset.findMany({
    select: { externalId: true },
  });
  const knownIds = new Set(existingDatasets.map((d) => d.externalId));

  logger.info(`📋 الـ Datasets المعروفة في قاعدة البيانات: ${knownIds.size}`);

  // Discover from website
  const discoveredIds = fullDiscovery
    ? await discoverAllDatasets()
    : await discoverDatasets();

  if (discoveredIds.length === 0) {
    logger.warn('⚠️ لم يتم اكتشاف أي datasets');
    return {
      total: 0,
      known: knownIds.size,
      newIds: [],
      all: [],
    };
  }

  // Find new ones
  const newIds = discoveredIds.filter((id) => !knownIds.has(id));

  logger.info('═══════════════════════════════════════════════════════');
  logger.info('📊 نتائج الاكتشاف:');
  logger.info(`   📁 على الموقع: ${discoveredIds.length}`);
  logger.info(`   ✅ معروفة: ${knownIds.size}`);
  logger.info(`   🆕 جديدة: ${newIds.length}`);
  logger.info('═══════════════════════════════════════════════════════');

  if (newIds.length > 0) {
    logger.info('🆕 الـ Datasets الجديدة:');
    newIds.slice(0, 20).forEach((id, i) => {
      logger.info(`   ${i + 1}. ${id}`);
    });
    if (newIds.length > 20) {
      logger.info(`   ... و ${newIds.length - 20} أخرى`);
    }

    // Log discovery to database
    await prisma.syncLog.create({
      data: {
        jobType: 'discovery',
        status: 'SUCCESS',
        recordsCount: discoveredIds.length,
        newRecords: newIds.length,
        metadata: JSON.stringify({
          total: discoveredIds.length,
          known: knownIds.size,
          newIds: newIds.slice(0, 100),
          fullDiscovery,
        }),
      },
    });
  }

  return {
    total: discoveredIds.length,
    known: knownIds.size,
    newIds,
    all: discoveredIds,
  };
}

/**
 * إضافة Datasets جديدة مع جلب المعلومات من الـ API
 */
export async function addNewDatasets(datasetIds: string[]): Promise<number> {
  logger.info(`📝 إضافة ${datasetIds.length} dataset جديدة...`);

  let added = 0;
  const batchSize = 10;

  for (let i = 0; i < datasetIds.length; i += batchSize) {
    const batch = datasetIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (externalId) => {
        try {
          const existing = await prisma.dataset.findUnique({
            where: { externalId },
          });

          if (!existing) {
            // Try to fetch metadata from API
            let name = `Dataset ${externalId.substring(0, 8)}`;
            let nameAr = `مجموعة بيانات ${externalId.substring(0, 8)}`;
            let category = 'أخرى';

            try {
              const response = await fetch(
                `https://open.data.gov.sa/data/api/datasets?version=-1&dataset=${externalId}`,
                {
                  headers: { Accept: 'application/json' },
                }
              );

              if (response.ok) {
                const data = await response.json();
                if (data) {
                  name = data.titleEn || name;
                  nameAr = data.titleAr || nameAr;
                  category = data.categories?.[0]?.titleAr || category;
                }
              }
            } catch {
              // Use default values if API fails
            }

            await prisma.dataset.create({
              data: {
                externalId,
                name,
                nameAr,
                category,
                syncStatus: 'PENDING',
              },
            });
            added++;
            logger.info(`   ➕ ${nameAr} (${externalId.substring(0, 8)}...)`);
          }
        } catch (error) {
          logger.error(`   ❌ فشل إضافة ${externalId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      })
    );

    // Progress update
    if (i + batchSize < datasetIds.length) {
      logger.info(`   📊 Progress: ${Math.min(i + batchSize, datasetIds.length)}/${datasetIds.length}`);
    }

    await delay(500);
  }

  logger.info(`✅ تم إضافة ${added} dataset جديدة`);
  return added;
}

/**
 * إحصائيات الـ Datasets
 */
export async function getDiscoveryStats() {
  const totalDatasets = await prisma.dataset.count();
  const syncedDatasets = await prisma.dataset.count({
    where: { syncStatus: 'SUCCESS' },
  });
  const pendingDatasets = await prisma.dataset.count({
    where: { syncStatus: 'PENDING' },
  });
  const failedDatasets = await prisma.dataset.count({
    where: { syncStatus: 'FAILED' },
  });

  // Get category breakdown
  const categoryBreakdown = await prisma.dataset.groupBy({
    by: ['category'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const lastDiscovery = await prisma.syncLog.findFirst({
    where: { jobType: 'discovery' },
    orderBy: { startedAt: 'desc' },
  });

  const totalRecords = await prisma.dataRecord.count();

  return {
    datasets: {
      total: totalDatasets,
      synced: syncedDatasets,
      pending: pendingDatasets,
      failed: failedDatasets,
    },
    categories: categoryBreakdown.map((c) => ({
      name: c.category,
      count: c._count.id,
    })),
    availableCategories: SAUDI_DATA_CATEGORIES.length,
    records: totalRecords,
    lastDiscovery: lastDiscovery?.startedAt || null,
    lastDiscoveryResult: lastDiscovery?.metadata ? JSON.parse(lastDiscovery.metadata as string) : null,
    browserlessConfigured: !!BROWSERLESS_TOKEN,
  };
}

/**
 * الحصول على قائمة الأقسام المتاحة
 */
export function getAvailableCategories(): CategoryInfo[] {
  return SAUDI_DATA_CATEGORIES;
}

export default {
  discoverDatasets,
  discoverAllDatasets,
  findNewDatasets,
  addNewDatasets,
  getDiscoveryStats,
  getAvailableCategories,
  SAUDI_DATA_CATEGORIES,
};
