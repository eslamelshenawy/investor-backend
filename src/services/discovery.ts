/**
 * خدمة اكتشاف Datasets جديدة
 * Discovery Service - Find new datasets using API or Puppeteer
 */

import axios from 'axios';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

const API_BASE = 'https://open.data.gov.sa/data/api';

interface DiscoveryResult {
  total: number;
  known: number;
  newIds: string[];
  all: string[];
}

/**
 * اكتشاف Datasets من API (الطريقة الأساسية - أسرع وأكثر موثوقية)
 */
async function discoverFromAPI(): Promise<string[]> {
  logger.info('🔍 اكتشاف من API...');

  try {
    // Try to get package list from CKAN API
    const response = await axios.get(`${API_BASE}/3/action/package_list`, {
      headers: {
        'User-Agent': 'InvestorRadar/1.0',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    if (response.data?.success && Array.isArray(response.data?.result)) {
      const ids = response.data.result;
      logger.info(`✅ تم اكتشاف ${ids.length} dataset من API`);
      return ids;
    }

    return [];
  } catch (error) {
    logger.warn(`⚠️ API discovery failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    return [];
  }
}

/**
 * اكتشاف Datasets من الموقع باستخدام Puppeteer (اختياري - fallback)
 */
async function discoverFromPuppeteer(): Promise<string[]> {
  logger.info('🔍 محاولة اكتشاف بـ Puppeteer...');

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
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    logger.info('📄 فتح صفحة الـ Datasets...');
    await page.goto('https://open.data.gov.sa/ar/datasets', {
      waitUntil: 'networkidle0',
      timeout: 90000,
    });

    await new Promise((r) => setTimeout(r, 10000));

    // Scroll to load all datasets
    let previousHeight = 0;
    let scrollAttempts = 0;
    let noChangeCount = 0;

    while (scrollAttempts < 20 && noChangeCount < 3) {
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

    // Extract IDs from page content
    const content = await page.content();
    const idMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
    const ids = [...new Set(idMatches.map((m) => m.replace('/datasets/view/', '')))];

    logger.info(`✅ تم اكتشاف ${ids.length} dataset بـ Puppeteer`);
    return ids;
  } catch (error) {
    logger.warn(`⚠️ Puppeteer غير متاح: ${error instanceof Error ? error.message : 'Not installed'}`);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * اكتشاف Datasets (يستخدم API أولاً، ثم Puppeteer كـ fallback)
 */
export async function discoverDatasets(): Promise<string[]> {
  logger.info('🔍 بدء اكتشاف الـ Datasets...');

  // Try API first (faster and more reliable)
  let ids = await discoverFromAPI();

  // If API returns few results, try Puppeteer as backup
  if (ids.length < 10) {
    logger.info('⚠️ API أعاد نتائج قليلة، جاري تجربة Puppeteer...');
    const puppeteerIds = await discoverFromPuppeteer();
    if (puppeteerIds.length > ids.length) {
      ids = puppeteerIds;
    }
  }

  if (ids.length === 0) {
    logger.warn('⚠️ لم يتم اكتشاف أي datasets');
  }

  return ids;
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
