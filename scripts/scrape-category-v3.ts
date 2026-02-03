/**
 * Scrape Category Script v3 - استخدام dropdown مجموعة البيانات
 *
 * Usage: npx ts-node scripts/scrape-category-v3.ts "المساحة والخرائط"
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

async function scrapeCategory(categoryName: string): Promise<DatasetInfo[]> {
  console.log(`🔍 جاري البحث عن: ${categoryName}`);

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });

  const datasets: DatasetInfo[] = [];
  const foundIds = new Set<string>();

  try {
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Capture API responses
    page.on('response', async (response) => {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          let items: any[] = [];

          // Try various response structures
          if (json.result?.results) items = json.result.results;
          else if (json.results) items = json.results;
          else if (json.data && Array.isArray(json.data)) items = json.data;
          else if (Array.isArray(json)) items = json;

          for (const item of items) {
            const id = item.id || item.uuid || item.package_id;
            const title = item.title || item.name || item.title_translated?.ar || '';
            if (id && title && !foundIds.has(id)) {
              foundIds.add(id);
              datasets.push({
                externalId: id,
                name: title,
                nameAr: title,
                description: item.notes || item.description || '',
                category: categoryName,
                sourceUrl: `${BASE_URL}/ar/datasets/view/${id}`
              });
              console.log(`   📦 API: ${title.substring(0, 50)}...`);
            }
          }
        }
      } catch {}
    });

    // Navigate to datasets page
    console.log(`\n📄 جاري تحميل الصفحة...`);
    await page.goto(`${BASE_URL}/ar/datasets`, { waitUntil: 'networkidle2', timeout: 90000 });

    // Wait for page to fully load
    console.log(`⏳ انتظار تحميل المحتوى...`);
    await delay(8000);

    // Take initial screenshot
    await page.screenshot({ path: 'debug-1-initial.png' });

    // Click on "مجموعة البيانات" dropdown
    console.log(`\n🔧 البحث عن dropdown مجموعة البيانات...`);

    // Find dropdown that contains category options
    const dropdownClicked = await page.evaluate((catName) => {
      // Find all expandable sections
      const sections = document.querySelectorAll('[class*="expand"], [class*="dropdown"], [class*="filter"], [class*="collapse"], details, .accordion');

      for (const section of sections) {
        const text = section.textContent || '';
        if (text.includes('مجموعة البيانات') || text.includes('التصنيف') || text.includes('الفئة')) {
          // Click to expand
          const header = section.querySelector('summary, [class*="header"], button, [class*="toggle"]');
          if (header) {
            (header as HTMLElement).click();
            return true;
          }
          (section as HTMLElement).click();
          return true;
        }
      }

      // Try clicking on any element with "مجموعة البيانات" text
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent?.trim() === 'مجموعة البيانات' || el.textContent?.trim().includes('مجموعة البيانات')) {
          (el as HTMLElement).click();
          return true;
        }
      }

      return false;
    }, categoryName);

    if (dropdownClicked) {
      console.log(`   ✅ تم النقر على dropdown`);
      await delay(3000);
      await page.screenshot({ path: 'debug-2-dropdown.png' });

      // Now find and click the category
      const categoryClicked = await page.evaluate((catName) => {
        // Find link or checkbox with category name
        const links = document.querySelectorAll('a, label, li, [class*="option"], [class*="item"]');
        for (const link of links) {
          if (link.textContent?.includes(catName)) {
            (link as HTMLElement).click();
            return true;
          }
        }

        // Try input/checkbox
        const inputs = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        for (const input of inputs) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label?.textContent?.includes(catName)) {
            (input as HTMLElement).click();
            return true;
          }
        }

        return false;
      }, categoryName);

      if (categoryClicked) {
        console.log(`   ✅ تم اختيار التصنيف: ${categoryName}`);
        await delay(5000);
      }
    }

    await page.screenshot({ path: 'debug-3-afterfilter.png' });

    // Scroll and load all datasets
    console.log(`\n⏳ جاري تحميل كل البيانات...`);

    let prevCount = 0;
    let sameCount = 0;

    for (let i = 0; i < 30 && sameCount < 5; i++) {
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      // Extract datasets from DOM
      const domData = await page.evaluate(() => {
        const results: Array<{id: string, title: string}> = [];
        document.querySelectorAll('a[href*="/datasets/view/"]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/datasets\/view\/([a-f0-9-]+)/i);
          if (match) {
            const card = a.closest('[class*="card"], [class*="item"], article, li, .dataset');
            let title = card?.querySelector('h3, h4, h5, [class*="title"]')?.textContent?.trim() || a.textContent?.trim() || '';
            if (title && match[1]) {
              results.push({ id: match[1], title });
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
            nameAr: item.title,
            description: '',
            category: categoryName,
            sourceUrl: `${BASE_URL}/ar/datasets/view/${item.id}`
          });
        }
      }

      if (datasets.length === prevCount) {
        sameCount++;
      } else {
        sameCount = 0;
        console.log(`   📊 تم جلب ${datasets.length} dataset...`);
      }
      prevCount = datasets.length;
    }

    await page.screenshot({ path: 'debug-4-final.png', fullPage: true });

  } catch (err: any) {
    console.error(`❌ خطأ: ${err.message}`);
  } finally {
    await browser.close();
  }

  return datasets;
}

async function updateDatabase(datasets: DatasetInfo[], categoryName: string) {
  console.log(`\n💾 تحديث قاعدة البيانات...`);

  let created = 0, updated = 0, skipped = 0;

  for (const ds of datasets) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId: ds.externalId } });

      if (existing) {
        if (existing.category !== categoryName) {
          await prisma.dataset.update({ where: { id: existing.id }, data: { category: categoryName } });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await prisma.dataset.create({
          data: {
            externalId: ds.externalId,
            name: ds.name,
            nameAr: ds.nameAr,
            description: ds.description,
            descriptionAr: ds.description,
            category: categoryName,
            source: 'البيانات المفتوحة السعودية',
            sourceUrl: ds.sourceUrl,
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

  console.log(`   ✅ إنشاء: ${created} | 🔄 تحديث: ${updated} | ⏭️ تخطي: ${skipped}`);
  return { created, updated, skipped };
}

async function main() {
  const categoryName = process.argv[2] || 'المساحة والخرائط';

  console.log('═'.repeat(60));
  console.log(`🚀 Scrape Category v3 - ${categoryName}`);
  console.log('═'.repeat(60));

  try {
    const currentCount = await prisma.dataset.count({ where: { category: categoryName, isActive: true } });
    console.log(`📊 العدد الحالي: ${currentCount}`);

    const datasets = await scrapeCategory(categoryName);
    console.log(`\n🔢 تم جلب: ${datasets.length}`);

    if (datasets.length > 0) {
      await updateDatabase(datasets, categoryName);
      const newCount = await prisma.dataset.count({ where: { category: categoryName, isActive: true } });
      console.log(`\n📊 العدد الجديد: ${newCount} (+${newCount - currentCount})`);
    }

  } catch (error: any) {
    console.error('❌', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
