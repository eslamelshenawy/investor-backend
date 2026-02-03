/**
 * Discover all datasets for a specific category
 * Uses the same approach as the main discovery service
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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractDatasetIds(content: string): string[] {
  const ids = new Set<string>();

  // Pattern: UUID in dataset view URLs
  const viewMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
  viewMatches.forEach(m => {
    const id = m.replace('/datasets/view/', '').toLowerCase();
    if (id) ids.add(id);
  });

  // Pattern: Any UUID
  const uuidMatches = content.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
  uuidMatches.forEach(id => {
    const lower = id.toLowerCase();
    if (!lower.includes('0000-0000')) ids.add(lower);
  });

  return Array.from(ids);
}

async function discoverCategory(categoryName: string): Promise<string[]> {
  console.log(`\n🔍 Discovering: ${categoryName}`);

  if (!BROWSERLESS_TOKEN) {
    console.log('❌ BROWSERLESS_TOKEN not found');
    return [];
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`
  });

  const allIds = new Set<string>();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Enable request interception
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());

    // Capture API responses
    page.on('response', async (response) => {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text();

          // Extract UUIDs from JSON
          const uuids = body.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
          uuids.forEach(id => allIds.add(id.toLowerCase()));

          // Try to parse and extract from data structures
          try {
            const json = JSON.parse(body);
            const items = json.data || json.results || json.content || [];
            if (Array.isArray(items)) {
              items.forEach((item: any) => {
                if (item.id) allIds.add(item.id.toString().toLowerCase());
              });
            }
          } catch {}
        }
      } catch {}
    });

    // Encode category for URL
    const encodedCategory = encodeURIComponent(categoryName);

    // Try different URL patterns with the category filter
    const urlPatterns = [
      `${BASE_URL}/ar/datasets?category=${encodedCategory}`,
      `${BASE_URL}/ar/datasets?groups=${encodedCategory}`,
      `${BASE_URL}/ar/datasets?fq=groups:${encodedCategory}`,
    ];

    // First, load the main page and apply filter
    console.log('📄 Loading main page...');
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(5000);

    // Click on category filter
    console.log('🔧 Applying category filter...');
    await page.evaluate((cat) => {
      // Click on التصنيف dropdown
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent?.includes('التصنيف') && ['BUTTON', 'DIV', 'SPAN'].includes(el.tagName)) {
          (el as HTMLElement).click();
        }
      });
    }, categoryName);
    await delay(2000);

    // Click on the specific category
    await page.evaluate((cat) => {
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent?.trim() === cat) {
          (el as HTMLElement).click();
        }
      });
    }, categoryName);
    await delay(5000);

    // Extract from initial page
    let content = await page.content();
    extractDatasetIds(content).forEach(id => allIds.add(id));
    console.log(`📊 Initial: ${allIds.size} datasets`);

    // Now use pagination
    console.log('\n⏳ Paginating...');
    for (let pageNum = 1; pageNum <= 50; pageNum++) {
      // Try URL pagination
      const pageUrl = `${BASE_URL}/ar/datasets?category=${encodedCategory}&page=${pageNum}`;

      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);

        content = await page.content();
        const pageIds = extractDatasetIds(content);
        const newIds = pageIds.filter(id => !allIds.has(id));

        if (newIds.length > 0) {
          newIds.forEach(id => allIds.add(id));
          console.log(`   📄 Page ${pageNum}: +${newIds.length} (total: ${allIds.size})`);
        } else {
          // Try alternative pagination
          const altUrl = `${BASE_URL}/ar/datasets?groups=${encodedCategory}&page=${pageNum}`;
          await page.goto(altUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await delay(2000);

          content = await page.content();
          const altIds = extractDatasetIds(content);
          const altNew = altIds.filter(id => !allIds.has(id));

          if (altNew.length > 0) {
            altNew.forEach(id => allIds.add(id));
            console.log(`   📄 Page ${pageNum} (alt): +${altNew.length} (total: ${allIds.size})`);
          } else if (pageNum > 5) {
            console.log(`   ✅ No more new datasets after page ${pageNum}`);
            break;
          }
        }
      } catch (err) {
        console.log(`   ⚠️ Page ${pageNum} error, continuing...`);
      }

      await delay(2000);
    }

    // Also try search pattern with category
    console.log('\n🔎 Trying search patterns...');
    const searchLetters = ['ا', 'م', 'ب', 'ع', 'ت'];
    for (const letter of searchLetters) {
      try {
        const searchUrl = `${BASE_URL}/ar/datasets?q=${encodeURIComponent(letter)}&category=${encodedCategory}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);

        content = await page.content();
        const searchIds = extractDatasetIds(content);
        const newFromSearch = searchIds.filter(id => !allIds.has(id));

        if (newFromSearch.length > 0) {
          newFromSearch.forEach(id => allIds.add(id));
          console.log(`   🔎 Search "${letter}": +${newFromSearch.length} (total: ${allIds.size})`);
        }
      } catch {}

      await delay(1500);
    }

    await page.screenshot({ path: 'discover-final.png' });

  } finally {
    await browser.close();
  }

  return Array.from(allIds);
}

async function saveToDatabase(datasetIds: string[], category: string) {
  console.log(`\n💾 Saving ${datasetIds.length} datasets to DB...`);

  let created = 0, updated = 0, skipped = 0;

  for (const externalId of datasetIds) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId } });

      if (existing) {
        if (existing.category !== category) {
          await prisma.dataset.update({
            where: { id: existing.id },
            data: { category }
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await prisma.dataset.create({
          data: {
            externalId,
            name: `Dataset ${externalId.substring(0, 8)}`,
            nameAr: `مجموعة بيانات ${externalId.substring(0, 8)}`,
            description: '',
            descriptionAr: '',
            category,
            source: 'البيانات المفتوحة السعودية',
            sourceUrl: `${BASE_URL}/ar/datasets/view/${externalId}`,
            columns: '[]',
            dataPreview: '[]',
            resources: '[]',
            isActive: true,
            syncStatus: 'PENDING'
          }
        });
        created++;
      }
    } catch (err) {
      // Skip errors
    }
  }

  console.log(`   ✅ Created: ${created} | 🔄 Updated: ${updated} | ⏭️ Skipped: ${skipped}`);
  return { created, updated, skipped };
}

async function main() {
  const category = process.argv[2] || 'المساحة والخرائط';

  console.log('═'.repeat(60));
  console.log(`🚀 Category Discovery: ${category}`);
  console.log('═'.repeat(60));

  const before = await prisma.dataset.count({ where: { category, isActive: true } });
  console.log(`📊 Current count: ${before}`);

  const datasetIds = await discoverCategory(category);
  console.log(`\n🔢 Total discovered: ${datasetIds.length}`);

  if (datasetIds.length > 0) {
    await saveToDatabase(datasetIds, category);

    const after = await prisma.dataset.count({ where: { category, isActive: true } });
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 New count: ${after} (+${after - before})`);
    console.log('═'.repeat(60));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
