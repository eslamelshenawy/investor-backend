/**
 * Scrape Category Script - جلب بيانات تصنيف معين
 *
 * Usage: npx ts-node scripts/scrape-category.ts "المساحة والخرائط"
 */

import * as dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';

// Use DIRECT_URL to avoid connection pooler issues
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

const BASE_URL = 'https://open.data.gov.sa';

interface DatasetInfo {
  externalId: string;
  name: string;
  nameAr: string;
  description: string;
  category: string;
  sourceUrl: string;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeCategory(categoryName: string): Promise<DatasetInfo[]> {
  console.log(`🔍 جاري البحث عن: ${categoryName}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const datasets: DatasetInfo[] = [];
  const foundIds = new Set<string>();

  try {
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Intercept API responses
    page.on('response', async (response) => {
      const url = response.url();
      // Capture any JSON responses with dataset data
      if (response.headers()['content-type']?.includes('application/json')) {
        try {
          const json = await response.json();
          // Look for dataset arrays in various response structures
          const items = json.result?.results || json.results || json.data || json.datasets || [];
          if (Array.isArray(items)) {
            for (const item of items) {
              const id = item.id || item.uuid || item.externalId;
              if (id && !foundIds.has(id)) {
                foundIds.add(id);
                datasets.push({
                  externalId: id,
                  name: item.title || item.name || item.title_translated?.en || '',
                  nameAr: item.title_translated?.ar || item.titleAr || item.title || item.name || '',
                  description: item.notes || item.description || '',
                  category: categoryName,
                  sourceUrl: `${BASE_URL}/ar/datasets/view/${id}`
                });
              }
            }
          }
        } catch {}
      }
    });

    // Navigate to datasets page with category filter
    const encodedCategory = encodeURIComponent(categoryName);
    const url = `${BASE_URL}/ar/datasets?category=${encodedCategory}`;

    console.log(`📄 جاري تحميل الصفحة...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

    // Wait for content
    await delay(5000);

    // Try to get the total count from page
    let totalOnPage = 0;
    try {
      const countText = await page.evaluate(() => {
        // Try various selectors for count
        const selectors = [
          '.total-datasets',
          '.datasets-count',
          '[class*="count"]',
          '.badge',
          'span:contains("نتيجة")',
          'span:contains("مجموعة")'
        ];
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.textContent) {
              const match = el.textContent.match(/(\d+)/);
              if (match) return match[1];
            }
          } catch {}
        }
        // Try to find any number near "نتيجة" or "مجموعة"
        const bodyText = document.body.innerText;
        const match = bodyText.match(/(\d+)\s*(نتيجة|مجموعة|dataset)/i);
        return match ? match[1] : '0';
      });
      totalOnPage = parseInt(countText) || 0;
      console.log(`📊 العدد المتوقع: ${totalOnPage}`);
    } catch {}

    // Scroll and load more
    console.log(`⏳ جاري تحميل كل البيانات...`);
    let lastCount = 0;
    let sameCountTimes = 0;

    for (let i = 0; i < 100 && sameCountTimes < 5; i++) {
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      // Click "load more" button if exists
      try {
        const loadMoreButton = await page.$('button[class*="load-more"], button:contains("المزيد"), .load-more-btn');
        if (loadMoreButton) {
          await loadMoreButton.click();
          await delay(3000);
        }
      } catch {}

      // Check progress
      if (datasets.length === lastCount) {
        sameCountTimes++;
      } else {
        sameCountTimes = 0;
        console.log(`   تم جلب ${datasets.length} dataset...`);
      }
      lastCount = datasets.length;
    }

    // If no datasets from API, try to extract from DOM
    if (datasets.length === 0) {
      console.log(`📝 محاولة استخراج من HTML...`);

      const domDatasets = await page.evaluate(() => {
        const results: Array<{id: string, title: string, desc: string, url: string}> = [];

        // Try to find dataset links
        const links = document.querySelectorAll('a[href*="/datasets/view/"]');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const match = href.match(/\/datasets\/view\/([a-f0-9-]+)/);
          if (match) {
            const id = match[1];
            const card = link.closest('.card, .dataset-card, [class*="dataset"], article, li');
            let title = '';
            let desc = '';

            if (card) {
              const titleEl = card.querySelector('h3, h4, h5, .title, [class*="title"]');
              title = titleEl?.textContent?.trim() || '';
              const descEl = card.querySelector('p, .description, [class*="desc"]');
              desc = descEl?.textContent?.trim() || '';
            }

            if (!title) {
              title = link.textContent?.trim() || '';
            }

            if (id && title && !results.find(r => r.id === id)) {
              results.push({ id, title, desc, url: href });
            }
          }
        });

        return results;
      });

      for (const item of domDatasets) {
        if (!foundIds.has(item.id)) {
          foundIds.add(item.id);
          datasets.push({
            externalId: item.id,
            name: item.title,
            nameAr: item.title,
            description: item.desc,
            category: categoryName,
            sourceUrl: `${BASE_URL}${item.url}`
          });
        }
      }
    }

    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log(`📸 تم حفظ screenshot للمراجعة: debug-screenshot.png`);

  } catch (err: any) {
    console.error(`❌ خطأ في الـ scraping: ${err.message}`);
  } finally {
    await browser.close();
  }

  return datasets;
}

async function updateDatabase(datasets: DatasetInfo[], categoryName: string) {
  console.log(`\n💾 جاري تحديث قاعدة البيانات...`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const dataset of datasets) {
    try {
      // Check if exists
      const existing = await prisma.dataset.findFirst({
        where: { externalId: dataset.externalId }
      });

      if (existing) {
        // Update category if different
        if (existing.category !== categoryName) {
          await prisma.dataset.update({
            where: { id: existing.id },
            data: { category: categoryName }
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create new
        await prisma.dataset.create({
          data: {
            externalId: dataset.externalId,
            name: dataset.name,
            nameAr: dataset.nameAr,
            description: dataset.description || '',
            descriptionAr: dataset.description || '',
            category: categoryName,
            source: 'البيانات المفتوحة السعودية',
            sourceUrl: dataset.sourceUrl,
            columns: '[]',
            dataPreview: '[]',
            resources: '[]',
            isActive: true,
            syncStatus: 'PENDING'
          }
        });
        created++;
        console.log(`   ✅ تم إنشاء: ${dataset.nameAr.substring(0, 50)}...`);
      }
    } catch (err: any) {
      console.error(`   ❌ خطأ في ${dataset.externalId}: ${err.message}`);
    }
  }

  console.log(`\n📊 النتائج:`);
  console.log(`   ✅ تم إنشاء: ${created}`);
  console.log(`   🔄 تم تحديث: ${updated}`);
  console.log(`   ⏭️ تم تخطي: ${skipped}`);

  return { created, updated, skipped };
}

async function main() {
  const categoryName = process.argv[2] || 'المساحة والخرائط';

  console.log('═'.repeat(60));
  console.log(`🚀 بدء جلب بيانات التصنيف: ${categoryName}`);
  console.log('═'.repeat(60));

  try {
    // Get current count
    const currentCount = await prisma.dataset.count({
      where: { category: categoryName, isActive: true }
    });
    console.log(`📊 العدد الحالي في قاعدة البيانات: ${currentCount}\n`);

    // Scrape
    const datasets = await scrapeCategory(categoryName);
    console.log(`\n🔢 تم جلب ${datasets.length} dataset من المنصة`);

    if (datasets.length > 0) {
      const result = await updateDatabase(datasets, categoryName);

      // Get new count
      const newCount = await prisma.dataset.count({
        where: { category: categoryName, isActive: true }
      });

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📊 العدد الجديد في قاعدة البيانات: ${newCount}`);
      console.log(`📈 الفرق: +${newCount - currentCount}`);
      console.log('═'.repeat(60));
    } else {
      console.log(`\n⚠️ لم يتم العثور على أي datasets. تحقق من الـ screenshot.`);
    }

  } catch (error: any) {
    console.error('❌ خطأ:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
