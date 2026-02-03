/**
 * Discover ALL datasets for "المساحة والخرائط" category
 * Uses the same approach as the main discovery service (v3)
 *
 * Usage: npx ts-node scripts/discover-maps-category.ts
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
const DATASETS_URL = `${BASE_URL}/ar/datasets`;
const CATEGORY_NAME = 'المساحة والخرائط';

const REQUEST_DELAY = 3000;
const PAGE_LOAD_TIMEOUT = 90000;
const SCROLL_DELAY = 2000;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Extract Dataset IDs from HTML content (same as discovery service)
 */
function extractDatasetIds(content: string): string[] {
  const allMatches = new Set<string>();

  // Pattern 1: UUID in dataset view URLs
  const viewMatches = content.match(/\/datasets\/view\/([a-f0-9-]{36})/gi) || [];
  viewMatches.forEach(m => {
    const id = m.replace('/datasets/view/', '').toLowerCase();
    if (id) allMatches.add(id);
  });

  // Pattern 2: UUID in data attributes
  const dataMatches = content.match(/data-id=["']([a-f0-9-]{36})["']/gi) || [];
  dataMatches.forEach(m => {
    const match = m.match(/[a-f0-9-]{36}/i);
    if (match) allMatches.add(match[0].toLowerCase());
  });

  // Pattern 3: UUID in href attributes
  const hrefMatches = content.match(/href=["'][^"']*([a-f0-9-]{36})[^"']*["']/gi) || [];
  hrefMatches.forEach(m => {
    const match = m.match(/[a-f0-9-]{36}/i);
    if (match) allMatches.add(match[0].toLowerCase());
  });

  // Pattern 4: Any UUID
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
 * Extract datasets from API response
 */
function extractDatasetsFromAPI(responseBody: string): Array<{ id: string; title: string }> {
  const datasets: Array<{ id: string; title: string }> = [];

  try {
    const data = JSON.parse(responseBody);
    const items = data.data || data.results || data.items || data.content || data;

    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        if (item.id || item.uuid || item.datasetId) {
          datasets.push({
            id: (item.id || item.uuid || item.datasetId).toString().toLowerCase(),
            title: item.titleAr || item.title || item.nameAr || item.name || ''
          });
        }
      });
    }
  } catch {}

  return datasets;
}

/**
 * Setup network interception once for a page
 */
let interceptorSetup = false;
const capturedIds = new Set<string>();

async function setupNetworkInterception(page: any): Promise<void> {
  if (interceptorSetup) return;

  await page.setRequestInterception(true);
  page.on('request', (req: any) => {
    try {
      if (!req.isInterceptResolutionHandled()) {
        req.continue();
      }
    } catch {}
  });

  page.on('response', async (response: any) => {
    try {
      const resUrl = response.url();
      if (resUrl.includes('/api/') || resUrl.includes('/data/') || resUrl.includes('datasets') || resUrl.includes('search')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text();

          // Extract from API response
          const datasets = extractDatasetsFromAPI(body);
          datasets.forEach(d => capturedIds.add(d.id));

          // Also extract raw UUIDs
          const uuids = body.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
          uuids.forEach(id => capturedIds.add(id.toLowerCase()));
        }
      }
    } catch {}
  });

  interceptorSetup = true;
}

/**
 * Simple page load and scroll (no interception setup)
 */
async function loadAndScroll(
  page: any,
  url: string,
  maxScrolls: number = 50
): Promise<Set<string>> {
  const allIds = new Set<string>();

  try {
    console.log(`   🌐 Loading: ${url.substring(0, 80)}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
    await delay(5000);

    // Extract from initial page
    let content = await page.content();
    extractDatasetIds(content).forEach(id => allIds.add(id));

    // Add any captured from network
    capturedIds.forEach(id => allIds.add(id));

    console.log(`   📄 Initial: ${allIds.size} datasets`);

    // Scroll to load more
    let previousCount = allIds.size;
    let noChangeCount = 0;

    for (let i = 0; i < maxScrolls && noChangeCount < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(SCROLL_DELAY);

      content = await page.content();
      extractDatasetIds(content).forEach(id => allIds.add(id));
      capturedIds.forEach(id => allIds.add(id));

      if (allIds.size === previousCount) {
        noChangeCount++;
      } else {
        if (i % 10 === 0) {
          console.log(`   📜 Scroll ${i}: ${allIds.size} datasets (+${allIds.size - previousCount})`);
        }
        noChangeCount = 0;
      }
      previousCount = allIds.size;
    }
  } catch (err: any) {
    console.log(`   ⚠️ Error: ${err.message}`);
  }

  return allIds;
}

/**
 * Discover with URL pagination
 */
async function discoverWithURLPagination(
  page: any,
  baseUrl: string,
  maxPages: number = 100
): Promise<Set<string>> {
  const allIds = new Set<string>();
  let consecutiveEmptyPages = 0;

  console.log(`\n📄 URL Pagination: ${baseUrl.substring(0, 60)}...`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const paginationUrls = [
      `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${pageNum}`,
      `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}p=${pageNum}`,
      `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}offset=${(pageNum - 1) * 20}`,
    ];

    let pageFound = false;

    for (const url of paginationUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(3000);

        const content = await page.content();
        const pageIds = extractDatasetIds(content);

        if (pageIds.length > 0) {
          const newCount = pageIds.filter(id => !allIds.has(id)).length;
          pageIds.forEach(id => allIds.add(id));

          if (newCount > 0) {
            consecutiveEmptyPages = 0;
            console.log(`   📄 Page ${pageNum}: +${newCount} new (total: ${allIds.size})`);
          } else {
            consecutiveEmptyPages++;
          }

          pageFound = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!pageFound) {
      consecutiveEmptyPages++;
    }

    if (consecutiveEmptyPages >= 3) {
      console.log(`   ✅ Pagination complete: No new datasets for 3 pages`);
      break;
    }

    await delay(REQUEST_DELAY);
  }

  return allIds;
}

/**
 * Main discovery function for المساحة والخرائط category
 */
async function discoverMapsCategory(): Promise<string[]> {
  console.log('═'.repeat(60));
  console.log(`🔍 Discovering ALL datasets for: ${CATEGORY_NAME}`);
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

    // Setup network interception once
    await setupNetworkInterception(page);

    // Category URL patterns to try
    const categoryUrls = [
      `${DATASETS_URL}?category=${encodeURIComponent(CATEGORY_NAME)}`,
      `${DATASETS_URL}?groups=${encodeURIComponent(CATEGORY_NAME)}`,
      `${DATASETS_URL}?fq=groups:${encodeURIComponent(CATEGORY_NAME)}`,
      `${BASE_URL}/ar/search?type=dataset&category=${encodeURIComponent(CATEGORY_NAME)}`,
    ];

    // Phase 1: Try category URL patterns with scrolling
    console.log('\n══════ Phase 1: Category URL patterns ══════');
    for (const url of categoryUrls) {
      try {
        const ids = await loadAndScroll(page, url, 30);
        const newCount = Array.from(ids).filter(id => !allIds.has(id)).length;
        ids.forEach(id => allIds.add(id));
        if (newCount > 0) {
          console.log(`   ✅ Found ${ids.size} (new: ${newCount}, total: ${allIds.size})`);
        }
      } catch (err: any) {
        console.log(`   ⚠️ Pattern failed: ${err.message}`);
      }
      await delay(REQUEST_DELAY);
    }

    // Phase 2: URL pagination for each working pattern
    console.log('\n══════ Phase 2: URL Pagination ══════');
    for (const url of categoryUrls) {
      try {
        const ids = await discoverWithURLPagination(page, url, 50);
        const newCount = Array.from(ids).filter(id => !allIds.has(id)).length;
        ids.forEach(id => allIds.add(id));
        if (newCount > 0) {
          console.log(`   ✅ After pagination: +${newCount} (total: ${allIds.size})`);
        }
      } catch {}
      await delay(REQUEST_DELAY);
    }

    // Phase 3: Search with Arabic letters (filtered by category)
    console.log('\n══════ Phase 3: Search patterns ══════');
    const searchLetters = ['ا', 'م', 'ب', 'ع', 'ت', 'خ', 'س', 'ح'];
    for (const letter of searchLetters) {
      try {
        const searchUrl = `${DATASETS_URL}?q=${encodeURIComponent(letter)}&category=${encodeURIComponent(CATEGORY_NAME)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(3000);

        const content = await page.content();
        const searchIds = extractDatasetIds(content);
        const newFromSearch = searchIds.filter(id => !allIds.has(id));

        if (newFromSearch.length > 0) {
          newFromSearch.forEach(id => allIds.add(id));
          console.log(`   🔎 Search "${letter}": +${newFromSearch.length} (total: ${allIds.size})`);
        }
      } catch {}
      await delay(1500);
    }

    // Phase 4: Deep scroll on filtered page
    console.log('\n══════ Phase 4: Deep scroll with category filter ══════');
    try {
      // Go to main page first
      await page.goto(`${DATASETS_URL}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(5000);

      // Try to click category filter
      console.log('   🔧 Attempting to apply category filter via UI...');

      // Click on "التصنيف" dropdown
      await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (const el of Array.from(elements)) {
          const text = (el as HTMLElement).textContent?.trim();
          if (text === 'التصنيف' || text?.includes('التصنيف')) {
            if (['BUTTON', 'DIV', 'SPAN', 'A', 'LABEL'].includes(el.tagName)) {
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });
      await delay(2000);

      // Click on the category
      await page.evaluate((catName: string) => {
        const elements = document.querySelectorAll('*');
        for (const el of Array.from(elements)) {
          const text = (el as HTMLElement).textContent?.trim();
          if (text === catName || text?.includes(catName)) {
            if (['A', 'LI', 'LABEL', 'SPAN', 'DIV', 'INPUT'].includes(el.tagName)) {
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      }, CATEGORY_NAME);
      await delay(5000);

      // Now scroll to load all
      let prevCount = allIds.size;
      let noChange = 0;
      for (let i = 0; i < 100 && noChange < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);

        const content = await page.content();
        extractDatasetIds(content).forEach(id => allIds.add(id));

        if (allIds.size === prevCount) {
          noChange++;
        } else {
          if (i % 10 === 0) {
            console.log(`   📜 Scroll ${i}: ${allIds.size} datasets (+${allIds.size - prevCount})`);
          }
          noChange = 0;
        }
        prevCount = allIds.size;
      }
    } catch (err: any) {
      console.log(`   ⚠️ Deep scroll failed: ${err.message}`);
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
      browser.disconnect();
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
  console.log(`🚀 Maps Category Discovery Script`);
  console.log(`📍 Category: ${CATEGORY_NAME}`);
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
