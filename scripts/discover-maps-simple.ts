/**
 * Simple discovery script for "المساحة والخرائط" category
 * Uses direct page content extraction without request interception
 *
 * Usage: npx ts-node scripts/discover-maps-simple.ts
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
const CATEGORY_NAME = 'المساحة والخرائط';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Extract Dataset IDs from HTML content
 */
function extractDatasetIds(content: string): string[] {
  const allMatches = new Set<string>();

  // Pattern 1: UUID in dataset view URLs
  const viewMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
  viewMatches.forEach(m => {
    const id = m.replace('/datasets/view/', '').toLowerCase();
    if (id) allMatches.add(id);
  });

  // Pattern 2: Any UUID format
  const uuidMatches = content.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi) || [];
  uuidMatches.forEach(id => {
    const lowerId = id.toLowerCase();
    if (!lowerId.includes('0000-0000') && !lowerId.startsWith('00000000')) {
      allMatches.add(lowerId);
    }
  });

  return Array.from(allMatches);
}

/**
 * Main discovery function
 */
async function discoverMapsCategory(): Promise<string[]> {
  console.log('═'.repeat(60));
  console.log(`🔍 Discovering datasets for: ${CATEGORY_NAME}`);
  console.log('═'.repeat(60));

  if (!BROWSERLESS_TOKEN) {
    console.log('❌ BROWSERLESS_TOKEN not found');
    return [];
  }

  const allIds = new Set<string>();
  let browser;

  try {
    console.log('\n🌐 Connecting to Browserless.io...');
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Go to main datasets page
    console.log('\n📄 Loading main page...');
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle2', timeout: 90000 });
    await delay(5000);

    // Click on التصنيف dropdown
    console.log('🔧 Opening filter dropdown...');
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of Array.from(elements)) {
        const text = (el as HTMLElement).textContent?.trim();
        if (text === 'التصنيف' || (text?.includes('التصنيف') && text.length < 30)) {
          if (['BUTTON', 'DIV', 'SPAN', 'A'].includes(el.tagName)) {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });
    await delay(3000);

    // Click on المساحة والخرائط
    console.log(`🔧 Selecting category: ${CATEGORY_NAME}...`);
    await page.evaluate((catName: string) => {
      const elements = document.querySelectorAll('*');
      for (const el of Array.from(elements)) {
        const text = (el as HTMLElement).textContent?.trim();
        if (text === catName) {
          (el as HTMLElement).click();
          return true;
        }
      }
      // Second pass: partial match
      for (const el of Array.from(elements)) {
        const text = (el as HTMLElement).textContent?.trim();
        if (text?.includes(catName) && text.length < 50) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, CATEGORY_NAME);
    await delay(5000);

    // Extract initial IDs
    let content = await page.content();
    extractDatasetIds(content).forEach(id => allIds.add(id));
    console.log(`📊 Initial: ${allIds.size} datasets`);

    // Scroll to load all content
    console.log('\n⏳ Scrolling to load all datasets...');
    let prevCount = allIds.size;
    let noChange = 0;

    for (let i = 0; i < 100 && noChange < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      // Try clicking "load more" button if exists
      try {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, a');
          for (const btn of Array.from(buttons)) {
            const text = (btn as HTMLElement).textContent?.toLowerCase() || '';
            if (text.includes('المزيد') || text.includes('more') || text.includes('التالي')) {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
      } catch {}

      content = await page.content();
      extractDatasetIds(content).forEach(id => allIds.add(id));

      if (allIds.size === prevCount) {
        noChange++;
      } else {
        console.log(`   📜 Scroll ${i}: ${allIds.size} datasets (+${allIds.size - prevCount})`);
        noChange = 0;
      }
      prevCount = allIds.size;
    }

    // Also try pagination via URL
    console.log('\n📄 Trying URL pagination...');
    const encodedCategory = encodeURIComponent(CATEGORY_NAME);

    for (let pageNum = 1; pageNum <= 30; pageNum++) {
      try {
        const urls = [
          `${BASE_URL}/ar/datasets?category=${encodedCategory}&page=${pageNum}`,
          `${BASE_URL}/ar/datasets?page=${pageNum}&category=${encodedCategory}`,
        ];

        for (const url of urls) {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await delay(2000);

          content = await page.content();
          const pageIds = extractDatasetIds(content);
          const newIds = pageIds.filter(id => !allIds.has(id));

          if (newIds.length > 0) {
            newIds.forEach(id => allIds.add(id));
            console.log(`   📄 Page ${pageNum}: +${newIds.length} (total: ${allIds.size})`);
            break;
          }
        }

        // Stop if no new IDs for a few pages
        if (pageNum > 5 && allIds.size === prevCount) {
          console.log('   ✅ No more new datasets');
          break;
        }
        prevCount = allIds.size;
      } catch {
        continue;
      }
    }

    await page.close();

    console.log('\n═'.repeat(60));
    console.log(`📊 Total discovered: ${allIds.size} datasets`);
    console.log('═'.repeat(60));

    return Array.from(allIds);

  } catch (err: any) {
    console.log(`❌ Error: ${err.message}`);
    return Array.from(allIds);
  } finally {
    if (browser) {
      try { browser.disconnect(); } catch {}
    }
  }
}

/**
 * Save discovered datasets to database
 */
async function saveToDatabase(datasetIds: string[]): Promise<void> {
  console.log(`\n💾 Saving ${datasetIds.length} datasets to database...`);

  let created = 0, updated = 0, skipped = 0;

  for (const externalId of datasetIds) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId } });

      if (existing) {
        if (existing.category !== CATEGORY_NAME) {
          await prisma.dataset.update({
            where: { id: existing.id },
            data: { category: CATEGORY_NAME }
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
            category: CATEGORY_NAME,
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
    } catch {}
  }

  console.log(`   ✅ Created: ${created} | 🔄 Updated: ${updated} | ⏭️ Skipped: ${skipped}`);
}

async function main() {
  console.log('═'.repeat(60));
  console.log(`🚀 Maps Category Discovery (Simple)
📍 Category: ${CATEGORY_NAME}`);
  console.log('═'.repeat(60));

  const before = await prisma.dataset.count({ where: { category: CATEGORY_NAME, isActive: true } });
  console.log(`📊 Current count in DB: ${before}\n`);

  const datasetIds = await discoverMapsCategory();

  if (datasetIds.length > 0) {
    await saveToDatabase(datasetIds);

    const after = await prisma.dataset.count({ where: { category: CATEGORY_NAME, isActive: true } });
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Final count: ${after} (+${after - before})`);
    console.log('═'.repeat(60));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
