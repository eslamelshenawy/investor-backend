/**
 * Scrape Category Script v2 - استخدام الـ API الداخلي
 *
 * Usage: npx ts-node scripts/scrape-category-v2.ts "المساحة والخرائط"
 */

import * as dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';

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

async function scrapeWithPagination(categoryName: string): Promise<DatasetInfo[]> {
  console.log(`🔍 جاري البحث عن: ${categoryName}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const datasets: DatasetInfo[] = [];
  const foundIds = new Set<string>();

  try {
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Capture all API responses
    page.on('response', async (response) => {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();

          // Extract datasets from various response structures
          let items: any[] = [];
          if (json.result?.results) items = json.result.results;
          else if (json.results) items = json.results;
          else if (json.data) items = Array.isArray(json.data) ? json.data : [];
          else if (Array.isArray(json)) items = json;

          for (const item of items) {
            const id = item.id || item.uuid || item.package_id;
            if (id && !foundIds.has(id)) {
              foundIds.add(id);
              datasets.push({
                externalId: id,
                name: item.title || item.name || '',
                nameAr: item.title_ar || item.title || item.name || '',
                description: item.notes || item.description || '',
                category: categoryName,
                sourceUrl: `${BASE_URL}/ar/datasets/view/${id}`
              });
            }
          }
        }
      } catch {}
    });

    // Navigate to datasets page
    console.log(`📄 جاري تحميل الصفحة الرئيسية...`);
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle2', timeout: 90000 });
    await delay(5000);

    // Find and click on category filter
    console.log(`🔧 جاري تطبيق فلتر التصنيف...`);

    // Try to find and click on category
    try {
      // Use XPath to find link containing the category name
      const [categoryLink] = await page.$x(`//a[contains(text(), "${categoryName}")]`);
      if (categoryLink) {
        await (categoryLink as any).click();
        await delay(5000);
        console.log(`   ✅ تم النقر على رابط التصنيف`);
      }
    } catch {}

    // Try different approaches to navigate to the category
    const categoryUrls = [
      `${BASE_URL}/ar/datasets?groups=${encodeURIComponent(categoryName)}`,
      `${BASE_URL}/ar/datasets?category=${encodeURIComponent(categoryName)}`,
      `${BASE_URL}/ar/datasets?q=&groups=${encodeURIComponent(categoryName)}`,
    ];

    for (const url of categoryUrls) {
      if (datasets.length < 50) {
        console.log(`📄 جاري تجربة: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(5000);

        // Scroll to load more
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await delay(2000);

          // Click load more if exists
          try {
            const [loadMore] = await page.$x('//button[contains(text(), "المزيد")] | //a[contains(text(), "المزيد")]');
            if (loadMore) {
              await (loadMore as any).click();
              await delay(3000);
            }
          } catch {}
        }

        console.log(`   تم جلب ${datasets.length} حتى الآن`);
      }
    }

    // Also try to extract from DOM
    console.log(`📝 استخراج من DOM...`);
    const domDatasets = await page.evaluate(() => {
      const results: Array<{id: string, title: string}> = [];
      const links = document.querySelectorAll('a[href*="/datasets/view/"]');
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/datasets\/view\/([a-f0-9-]+)/);
        if (match) {
          const title = link.textContent?.trim() ||
                       link.closest('[class*="card"]')?.querySelector('h3, h4, .title')?.textContent?.trim() || '';
          if (title) {
            results.push({ id: match[1], title });
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
          description: '',
          category: categoryName,
          sourceUrl: `${BASE_URL}/ar/datasets/view/${item.id}`
        });
      }
    }

    console.log(`📸 حفظ screenshot...`);
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

  } catch (err: any) {
    console.error(`❌ خطأ: ${err.message}`);
  } finally {
    await browser.close();
  }

  return datasets;
}

async function updateDatabase(datasets: DatasetInfo[], categoryName: string) {
  console.log(`\n💾 جاري تحديث قاعدة البيانات (${datasets.length} dataset)...`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const dataset of datasets) {
    try {
      const existing = await prisma.dataset.findFirst({
        where: { externalId: dataset.externalId }
      });

      if (existing) {
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
        if (created <= 10) {
          console.log(`   ✅ ${dataset.nameAr.substring(0, 40)}...`);
        }
      }
    } catch (err: any) {
      errors++;
    }
  }

  console.log(`\n📊 النتائج:`);
  console.log(`   ✅ تم إنشاء: ${created}`);
  console.log(`   🔄 تم تحديث: ${updated}`);
  console.log(`   ⏭️ تم تخطي: ${skipped}`);
  if (errors > 0) console.log(`   ❌ أخطاء: ${errors}`);

  return { created, updated, skipped, errors };
}

async function main() {
  const categoryName = process.argv[2] || 'المساحة والخرائط';

  console.log('═'.repeat(60));
  console.log(`🚀 Scrape Category v2 - ${categoryName}`);
  console.log('═'.repeat(60));

  try {
    const currentCount = await prisma.dataset.count({
      where: { category: categoryName, isActive: true }
    });
    console.log(`📊 العدد الحالي: ${currentCount}\n`);

    const datasets = await scrapeWithPagination(categoryName);
    console.log(`\n🔢 إجمالي ما تم جلبه: ${datasets.length}`);

    if (datasets.length > 0) {
      await updateDatabase(datasets, categoryName);

      const newCount = await prisma.dataset.count({
        where: { category: categoryName, isActive: true }
      });

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📊 العدد الجديد: ${newCount}`);
      console.log(`📈 الفرق: +${newCount - currentCount}`);
      console.log('═'.repeat(60));
    }

  } catch (error: any) {
    console.error('❌ خطأ:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
