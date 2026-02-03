/**
 * Scrape ALL datasets for a category using pagination
 */

import * as dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

const BASE_URL = 'https://open.data.gov.sa';

interface DatasetInfo {
  externalId: string;
  name: string;
  description: string;
  sourceUrl: string;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function scrapeAllPages(categoryName: string): Promise<DatasetInfo[]> {
  console.log(`🔍 جاري جلب كل بيانات: ${categoryName}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const datasets: DatasetInfo[] = [];
  const foundIds = new Set<string>();

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Intercept ALL network responses
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('json') || url.includes('api') || url.includes('search')) {
          const text = await response.text();

          // Try to parse as JSON
          try {
            const json = JSON.parse(text);

            // Look for datasets in various structures
            const extractDatasets = (obj: any) => {
              if (!obj) return;

              if (Array.isArray(obj)) {
                for (const item of obj) {
                  if (item && typeof item === 'object') {
                    const id = item.id || item.uuid || item.package_id || item.name;
                    const title = item.title || item.title_ar || item.name || '';

                    if (id && title && typeof id === 'string' && id.includes('-') && !foundIds.has(id)) {
                      foundIds.add(id);
                      datasets.push({
                        externalId: id,
                        name: title,
                        description: item.notes || item.description || '',
                        sourceUrl: `${BASE_URL}/ar/datasets/view/${id}`
                      });
                    }
                  }
                }
              }

              // Recursively search in objects
              if (typeof obj === 'object') {
                for (const key of Object.keys(obj)) {
                  if (['result', 'results', 'data', 'datasets', 'items', 'packages'].includes(key)) {
                    extractDatasets(obj[key]);
                  }
                }
              }
            };

            extractDatasets(json);
          } catch {}
        }
      } catch {}
    });

    // Go to datasets page
    console.log('📄 تحميل الصفحة الرئيسية...');
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle0', timeout: 60000 });
    await delay(5000);

    // Click on category filter
    console.log('🔧 تطبيق فلتر التصنيف...');

    // Click on "التصنيف" dropdown
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent?.includes('التصنيف') && (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.tagName === 'SPAN')) {
          (el as HTMLElement).click();
          break;
        }
      }
    });
    await delay(2000);

    // Click on the category
    const clicked = await page.evaluate((catName) => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text === catName || text?.includes(catName)) {
          if (el.tagName === 'A' || el.tagName === 'LI' || el.tagName === 'LABEL' || el.tagName === 'SPAN' || el.tagName === 'DIV') {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    }, categoryName);

    if (clicked) {
      console.log(`   ✅ تم اختيار: ${categoryName}`);
    }

    await delay(5000);

    // Now scroll and paginate to load all
    console.log('\n⏳ جاري تحميل كل الصفحات...');

    let pageNum = 1;
    let prevCount = 0;
    let noChangeCount = 0;

    while (noChangeCount < 3) {
      // Scroll to bottom multiple times
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(1000);
      }

      // Try to click "Load More" or next page
      const clickedMore = await page.evaluate(() => {
        // Look for load more button
        const buttons = document.querySelectorAll('button, a');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('المزيد') || text.includes('more') || text.includes('التالي') || text.includes('next')) {
            (btn as HTMLElement).click();
            return 'loadmore';
          }
        }

        // Look for pagination
        const pagination = document.querySelectorAll('.pagination a, .page-link, [class*="pagination"] a, [class*="page"] a');
        for (const link of pagination) {
          const text = link.textContent?.trim();
          if (text && /^\d+$/.test(text)) {
            const num = parseInt(text);
            const current = document.querySelector('.active .page-link, [class*="active"] [class*="page"]');
            const currentNum = parseInt(current?.textContent?.trim() || '1');
            if (num === currentNum + 1) {
              (link as HTMLElement).click();
              return 'pagination';
            }
          }
        }

        return null;
      });

      if (clickedMore) {
        console.log(`   📄 صفحة ${pageNum}: ${datasets.length} dataset (${clickedMore})`);
        pageNum++;
        await delay(3000);
      }

      // Also extract from DOM
      const domData = await page.evaluate(() => {
        const results: Array<{id: string, title: string, desc: string}> = [];
        document.querySelectorAll('a[href*="/datasets/view/"]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/datasets\/view\/([a-f0-9-]+)/i);
          if (match) {
            const card = a.closest('[class*="card"], [class*="item"], article, li, .dataset, tr');
            const title = card?.querySelector('h3, h4, h5, [class*="title"], td:first-child')?.textContent?.trim()
                         || a.textContent?.trim() || '';
            const desc = card?.querySelector('p, [class*="desc"]')?.textContent?.trim() || '';
            if (title && match[1]) {
              results.push({ id: match[1], title, desc });
            }
          }
        });
        return results;
      });

      for (const item of domData) {
        if (!foundIds.has(item.id)) {
          foundIds.add(item.id);
          datasets.push({
            externalId: item.id,
            name: item.title,
            description: item.desc,
            sourceUrl: `${BASE_URL}/ar/datasets/view/${item.id}`
          });
        }
      }

      // Check if we got new data
      if (datasets.length === prevCount) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
        console.log(`   📊 إجمالي: ${datasets.length} dataset`);
      }
      prevCount = datasets.length;

      await delay(2000);
    }

    await page.screenshot({ path: 'scrape-final.png', fullPage: true });

  } finally {
    await browser.close();
  }

  return datasets;
}

async function updateDB(datasets: DatasetInfo[], category: string) {
  console.log(`\n💾 تحديث قاعدة البيانات (${datasets.length})...`);

  let created = 0, updated = 0, skipped = 0;

  for (const ds of datasets) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId: ds.externalId } });

      if (existing) {
        if (existing.category !== category) {
          await prisma.dataset.update({ where: { id: existing.id }, data: { category } });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await prisma.dataset.create({
          data: {
            externalId: ds.externalId,
            name: ds.name,
            nameAr: ds.name,
            description: ds.description,
            descriptionAr: ds.description,
            category,
            source: 'البيانات المفتوحة السعودية',
            sourceUrl: ds.sourceUrl,
            columns: '[]', dataPreview: '[]', resources: '[]',
            isActive: true, syncStatus: 'PENDING'
          }
        });
        created++;
      }
    } catch {}
  }

  console.log(`   ✅ إنشاء: ${created} | 🔄 تحديث: ${updated} | ⏭️ تخطي: ${skipped}`);
  return { created, updated, skipped };
}

async function main() {
  const category = process.argv[2] || 'المساحة والخرائط';

  console.log('═'.repeat(60));
  console.log(`🚀 جلب كل بيانات: ${category}`);
  console.log('═'.repeat(60));

  const currentCount = await prisma.dataset.count({ where: { category, isActive: true } });
  console.log(`📊 العدد الحالي: ${currentCount}\n`);

  const datasets = await scrapeAllPages(category);
  console.log(`\n🔢 تم جلب: ${datasets.length}`);

  if (datasets.length > 0) {
    await updateDB(datasets, category);
    const newCount = await prisma.dataset.count({ where: { category, isActive: true } });
    console.log(`\n📊 العدد الجديد: ${newCount} (+${newCount - currentCount})`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
