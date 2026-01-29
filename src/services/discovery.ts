/**
 * خدمة اكتشاف Datasets جديدة
 * Discovery Service - Uses Browserless.io for cloud Chrome
 */

import puppeteer from 'puppeteer-core';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

interface DiscoveryResult {
  total: number;
  known: number;
  newIds: string[];
  all: string[];
}

// Browserless.io connection
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io?token=';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';

/**
 * اكتشاف Datasets من الموقع باستخدام Browserless.io
 */
export async function discoverDatasets(): Promise<string[]> {
  logger.info('🔍 بدء اكتشاف الـ Datasets...');

  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN غير موجود - أضفه في Environment Variables');
    return [];
  }

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

    logger.info('📄 فتح صفحة الـ Datasets...');
    await page.goto('https://open.data.gov.sa/ar/datasets', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    // Wait for page to load
    await new Promise((r) => setTimeout(r, 5000));

    // Scroll to load all datasets
    logger.info('📜 تحميل كل البيانات...');
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
      await new Promise((r) => setTimeout(r, 1500));
      scrollAttempts++;
    }

    // Extract IDs from page content
    logger.info('🔎 استخراج الـ IDs...');
    const content = await page.content();
    const idMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
    const ids = [...new Set(idMatches.map((m) => m.replace('/datasets/view/', '')))];

    logger.info(`✅ تم اكتشاف ${ids.length} dataset`);

    await page.close();
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
    newIds.slice(0, 10).forEach((id, i) => {
      logger.info(`   ${i + 1}. ${id}`);
    });
    if (newIds.length > 10) {
      logger.info(`   ... و ${newIds.length - 10} أخرى`);
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
          newIds: newIds.slice(0, 50),
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
 * إضافة Datasets جديدة
 */
export async function addNewDatasets(datasetIds: string[]): Promise<number> {
  logger.info(`📝 إضافة ${datasetIds.length} dataset جديدة...`);

  let added = 0;

  for (const externalId of datasetIds) {
    try {
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
      logger.error(`   ❌ فشل إضافة ${externalId}`);
    }
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
    browserlessConfigured: !!BROWSERLESS_TOKEN,
  };
}

export default {
  discoverDatasets,
  findNewDatasets,
  addNewDatasets,
  getDiscoveryStats,
};
