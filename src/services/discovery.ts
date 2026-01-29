/**
 * خدمة اكتشاف Datasets جديدة
 * Discovery Service - Find new datasets using Puppeteer
 */

import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

const SITE_URL = 'https://open.data.gov.sa';
const DATASETS_PAGE = `${SITE_URL}/ar/datasets`;

interface DiscoveryResult {
  total: number;
  known: number;
  newIds: string[];
  all: string[];
}

/**
 * اكتشاف Datasets من الموقع باستخدام Puppeteer
 */
export async function discoverDatasets(): Promise<string[]> {
  logger.info('🔍 بدء اكتشاف الـ Datasets...');

  let browser;
  try {
    // Dynamic import for puppeteer (optional dependency)
    const puppeteer = await import('puppeteer');

    logger.info('🌐 تشغيل المتصفح...');
    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Go to datasets page
    logger.info('📄 فتح صفحة الـ Datasets...');
    await page.goto(DATASETS_PAGE, {
      waitUntil: 'networkidle0',
      timeout: 90000,
    });

    // Wait for page to load
    logger.info('⏳ انتظار تحميل الصفحة...');
    await new Promise((r) => setTimeout(r, 10000));

    // Try multiple selectors
    const selectors = [
      'a[href*="/datasets/view/"]',
      '[routerlink*="/datasets/view"]',
      '.dataset-card a',
      '.card a[href*="datasets"]',
    ];

    let found = false;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        found = true;
        logger.info(`✅ وجدت العناصر بـ: ${selector}`);
        break;
      } catch {
        continue;
      }
    }

    if (!found) {
      // Try to get page content and extract IDs from it
      const content = await page.content();
      const idMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
      const ids = [...new Set(idMatches.map((m) => m.replace('/datasets/view/', '')))];

      if (ids.length > 0) {
        logger.info(`✅ تم استخراج ${ids.length} ID من محتوى الصفحة`);
        return ids;
      }

      throw new Error('لم يتم العثور على أي datasets في الصفحة');
    }

    // Scroll to load all datasets (lazy loading)
    logger.info('📜 تحميل كل البيانات...');
    let previousHeight = 0;
    let scrollAttempts = 0;
    let noChangeCount = 0;

    while (scrollAttempts < 30 && noChangeCount < 3) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
      }

      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 2000));
      scrollAttempts++;
    }

    // Extract all dataset IDs
    logger.info('🔎 استخراج الـ IDs...');
    const discoveredIds = await page.evaluate(() => {
      const ids = new Set<string>();

      // Method 1: From links
      document.querySelectorAll('a[href*="/datasets/view/"]').forEach((link) => {
        const match = (link as HTMLAnchorElement).href.match(/\/datasets\/view\/([a-f0-9-]+)/i);
        if (match) ids.add(match[1]);
      });

      // Method 2: From page content
      const content = document.body.innerHTML;
      const matches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
      matches.forEach((m) => {
        const id = m.replace('/datasets/view/', '');
        ids.add(id);
      });

      return Array.from(ids);
    });

    logger.info(`✅ تم العثور على ${discoveredIds.length} dataset`);

    return discoveredIds;
  } catch (error) {
    logger.error(`❌ خطأ في الاكتشاف: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * مقارنة الـ Datasets المكتشفة مع الموجودة في قاعدة البيانات
 */
export async function findNewDatasets(): Promise<DiscoveryResult> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('🔍 بدء عملية اكتشاف Datasets جديدة');
  logger.info('═══════════════════════════════════════════════════════');

  // Get known IDs from database
  const existingDatasets = await prisma.dataset.findMany({
    select: { externalId: true },
  });
  const knownIds = new Set(existingDatasets.map((d) => d.externalId));

  logger.info(`📋 الـ Datasets المعروفة في قاعدة البيانات: ${knownIds.size}`);

  // Discover from website
  const discoveredIds = await discoverDatasets();

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
    newIds.forEach((id, i) => {
      logger.info(`   ${i + 1}. ${id}`);
    });

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
          newIds,
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
 * إضافة Datasets جديدة يدوياً
 */
export async function addNewDatasets(datasetIds: string[]): Promise<number> {
  logger.info(`📝 إضافة ${datasetIds.length} dataset جديدة...`);

  let added = 0;

  for (const externalId of datasetIds) {
    try {
      // Check if already exists
      const existing = await prisma.dataset.findUnique({
        where: { externalId },
      });

      if (!existing) {
        await prisma.dataset.create({
          data: {
            externalId,
            name: `Dataset ${externalId.substring(0, 8)}`,
            nameAr: `مجموعة بيانات ${externalId.substring(0, 8)}`,
            category: 'أخرى',
            syncStatus: 'PENDING',
          },
        });
        added++;
        logger.info(`   ➕ ${externalId}`);
      }
    } catch (error) {
      logger.error(`   ❌ فشل إضافة ${externalId}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  logger.info(`✅ تم إضافة ${added} dataset جديدة`);
  return added;
}

/**
 * الحصول على إحصائيات الاكتشاف
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

  const lastDiscovery = await prisma.syncLog.findFirst({
    where: { jobType: 'discovery' },
    orderBy: { createdAt: 'desc' },
  });

  const totalRecords = await prisma.dataRecord.count();

  return {
    datasets: {
      total: totalDatasets,
      synced: syncedDatasets,
      pending: pendingDatasets,
      failed: failedDatasets,
    },
    records: totalRecords,
    lastDiscovery: lastDiscovery?.createdAt || null,
    lastDiscoveryResult: lastDiscovery?.metadata ? JSON.parse(lastDiscovery.metadata as string) : null,
  };
}

export default {
  discoverDatasets,
  findNewDatasets,
  addNewDatasets,
  getDiscoveryStats,
};
