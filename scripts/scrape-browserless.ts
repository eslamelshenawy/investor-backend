/**
 * Scrape using Browserless.io (Cloud Chrome)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer-core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
const BASE_URL = 'https://open.data.gov.sa';

interface DatasetInfo {
  externalId: string;
  name: string;
  sourceUrl: string;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function scrape(categoryName: string): Promise<DatasetInfo[]> {
  console.log(`🔍 Browserless scraping: ${categoryName}\n`);

  if (!BROWSERLESS_TOKEN) {
    console.log('❌ BROWSERLESS_TOKEN not set');
    return [];
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`
  });

  const datasets: DatasetInfo[] = [];
  const foundIds = new Set<string>();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Intercept API responses
    page.on('response', async (response) => {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const json = await response.json();
          const items = json.result?.results || json.results || json.data || [];
          if (Array.isArray(items)) {
            for (const item of items) {
              const id = item.id || item.uuid;
              const title = item.title || item.name || '';
              if (id && title && id.includes('-') && !foundIds.has(id)) {
                foundIds.add(id);
                datasets.push({
                  externalId: id,
                  name: title,
                  sourceUrl: `${BASE_URL}/ar/datasets/view/${id}`
                });
              }
            }
          }
        }
      } catch {}
    });

    console.log('📄 Loading page...');
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(5000);

    // Click on التصنيف dropdown
    console.log('🔧 Clicking filter...');
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent?.trim() === 'التصنيف') {
          (el as HTMLElement).click();
        }
      });
    });
    await delay(2000);

    // Click on category
    await page.evaluate((cat) => {
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent?.trim() === cat) {
          (el as HTMLElement).click();
        }
      });
    }, categoryName);
    await delay(5000);

    // Scroll and load
    console.log('⏳ Loading all data...');
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1500);

      // Extract from DOM
      const domItems = await page.evaluate(() => {
        const results: Array<{id: string, title: string}> = [];
        document.querySelectorAll('a[href*="/datasets/view/"]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/datasets\/view\/([a-f0-9-]+)/i);
          if (match) {
            const card = a.closest('[class*="card"], article, li');
            const title = card?.querySelector('h3, h4, [class*="title"]')?.textContent?.trim() || a.textContent?.trim() || '';
            if (title) results.push({ id: match[1], title });
          }
        });
        return results;
      });

      for (const item of domItems) {
        if (!foundIds.has(item.id)) {
          foundIds.add(item.id);
          datasets.push({
            externalId: item.id,
            name: item.title,
            sourceUrl: `${BASE_URL}/ar/datasets/view/${item.id}`
          });
        }
      }

      if (i % 5 === 0) console.log(`   ${datasets.length} datasets...`);
    }

    await page.screenshot({ path: 'browserless-screenshot.png' });

  } finally {
    await browser.close();
  }

  return datasets;
}

async function updateDB(datasets: DatasetInfo[], category: string) {
  console.log(`\n💾 Updating DB (${datasets.length})...`);
  let created = 0, updated = 0, skipped = 0;

  for (const ds of datasets) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId: ds.externalId } });
      if (existing) {
        if (existing.category !== category) {
          await prisma.dataset.update({ where: { id: existing.id }, data: { category } });
          updated++;
        } else skipped++;
      } else {
        await prisma.dataset.create({
          data: {
            externalId: ds.externalId, name: ds.name, nameAr: ds.name,
            description: '', descriptionAr: '', category,
            source: 'البيانات المفتوحة السعودية', sourceUrl: ds.sourceUrl,
            columns: '[]', dataPreview: '[]', resources: '[]',
            isActive: true, syncStatus: 'PENDING'
          }
        });
        created++;
      }
    } catch {}
  }

  console.log(`   ✅ Created: ${created} | 🔄 Updated: ${updated} | ⏭️ Skipped: ${skipped}`);
}

async function main() {
  const category = process.argv[2] || 'المساحة والخرائط';
  console.log('═'.repeat(50));
  console.log(`🚀 ${category}`);
  console.log('═'.repeat(50));

  const before = await prisma.dataset.count({ where: { category, isActive: true } });
  console.log(`📊 Current: ${before}\n`);

  const datasets = await scrape(category);
  console.log(`\n🔢 Found: ${datasets.length}`);

  if (datasets.length > 0) {
    await updateDB(datasets, category);
    const after = await prisma.dataset.count({ where: { category, isActive: true } });
    console.log(`\n📊 New total: ${after} (+${after - before})`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
