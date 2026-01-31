/**
 * خدمة اكتشاف Datasets جديدة - النسخة المحسنة v3
 * Enhanced Discovery Service v3 - Full Pagination Support
 *
 * التحسينات في v3:
 * - دعم كامل للـ Pagination بالـ URL (?page=1, ?page=2, ...)
 * - اكتشاف كل الأقسام مع pagination لكل قسم
 * - اعتراض طلبات الشبكة للعثور على API الداخلي
 * - يجلب كل الـ 15,500+ dataset من منصة البيانات المفتوحة السعودية
 */

import puppeteer from 'puppeteer-core';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface DiscoveryResult {
  total: number;
  known: number;
  newIds: string[];
  all: string[];
  byCategory?: Record<string, number>;
}

interface CategoryInfo {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
}

interface DiscoveryProgress {
  category: string;
  page: number;
  found: number;
  total: number;
}

interface DatasetFromAPI {
  id: string;
  titleAr?: string;
  titleEn?: string;
  category?: string;
  organization?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io?token=';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';

const BASE_URL = 'https://open.data.gov.sa';
const DATASETS_URL = `${BASE_URL}/ar/datasets`;

// تأخير بين الطلبات لتجنب الحظر
const REQUEST_DELAY = 3000;
const PAGE_LOAD_TIMEOUT = 90000;
const SCROLL_DELAY = 2000;
const MAX_SCROLL_ATTEMPTS = 200; // زيادة كبيرة لجلب المزيد

// ═══════════════════════════════════════════════════════════════════
// قائمة كل الأقسام المتاحة في منصة البيانات المفتوحة السعودية
// All available categories on Saudi Open Data Platform
// ═══════════════════════════════════════════════════════════════════

export const SAUDI_DATA_CATEGORIES: CategoryInfo[] = [
  // الأقسام الرئيسية
  { id: 'economy', nameAr: 'الاقتصاد', nameEn: 'Economy', slug: 'economy' },
  { id: 'finance', nameAr: 'المالية', nameEn: 'Finance', slug: 'finance' },
  { id: 'health', nameAr: 'الصحة', nameEn: 'Health', slug: 'health' },
  { id: 'education', nameAr: 'التعليم', nameEn: 'Education', slug: 'education' },
  { id: 'environment', nameAr: 'البيئة', nameEn: 'Environment', slug: 'environment' },
  { id: 'labor', nameAr: 'العمل', nameEn: 'Labor', slug: 'labor' },
  { id: 'housing', nameAr: 'الإسكان', nameEn: 'Housing', slug: 'housing' },
  { id: 'real-estate', nameAr: 'العقارات', nameEn: 'Real Estate', slug: 'real-estate' },
  { id: 'transport', nameAr: 'النقل', nameEn: 'Transport', slug: 'transport' },
  { id: 'tourism', nameAr: 'السياحة', nameEn: 'Tourism', slug: 'tourism' },
  { id: 'agriculture', nameAr: 'الزراعة', nameEn: 'Agriculture', slug: 'agriculture' },
  { id: 'energy', nameAr: 'الطاقة', nameEn: 'Energy', slug: 'energy' },
  { id: 'industry', nameAr: 'الصناعة', nameEn: 'Industry', slug: 'industry' },
  { id: 'trade', nameAr: 'التجارة', nameEn: 'Trade', slug: 'trade' },
  { id: 'investment', nameAr: 'الاستثمار', nameEn: 'Investment', slug: 'investment' },
  { id: 'technology', nameAr: 'التقنية', nameEn: 'Technology', slug: 'technology' },
  { id: 'communications', nameAr: 'الاتصالات', nameEn: 'Communications', slug: 'communications' },
  { id: 'justice', nameAr: 'العدل', nameEn: 'Justice', slug: 'justice' },
  { id: 'security', nameAr: 'الأمن', nameEn: 'Security', slug: 'security' },
  { id: 'social', nameAr: 'الشؤون الاجتماعية', nameEn: 'Social Affairs', slug: 'social' },
  { id: 'culture', nameAr: 'الثقافة', nameEn: 'Culture', slug: 'culture' },
  { id: 'sports', nameAr: 'الرياضة', nameEn: 'Sports', slug: 'sports' },
  { id: 'media', nameAr: 'الإعلام', nameEn: 'Media', slug: 'media' },
  { id: 'government', nameAr: 'الحكومة', nameEn: 'Government', slug: 'government' },
  { id: 'statistics', nameAr: 'الإحصاءات', nameEn: 'Statistics', slug: 'statistics' },
  { id: 'demographics', nameAr: 'السكان', nameEn: 'Demographics', slug: 'demographics' },
  { id: 'municipalities', nameAr: 'البلديات', nameEn: 'Municipalities', slug: 'municipalities' },
  { id: 'water', nameAr: 'المياه', nameEn: 'Water', slug: 'water' },
  { id: 'electricity', nameAr: 'الكهرباء', nameEn: 'Electricity', slug: 'electricity' },
  { id: 'hajj', nameAr: 'الحج والعمرة', nameEn: 'Hajj & Umrah', slug: 'hajj' },
  { id: 'islamic-affairs', nameAr: 'الشؤون الإسلامية', nameEn: 'Islamic Affairs', slug: 'islamic-affairs' },
  { id: 'human-resources', nameAr: 'الموارد البشرية', nameEn: 'Human Resources', slug: 'human-resources' },
  { id: 'civil-service', nameAr: 'الخدمة المدنية', nameEn: 'Civil Service', slug: 'civil-service' },
  { id: 'foreign-affairs', nameAr: 'الشؤون الخارجية', nameEn: 'Foreign Affairs', slug: 'foreign-affairs' },
  { id: 'interior', nameAr: 'الداخلية', nameEn: 'Interior', slug: 'interior' },
  { id: 'defense', nameAr: 'الدفاع', nameEn: 'Defense', slug: 'defense' },
  { id: 'national-guard', nameAr: 'الحرس الوطني', nameEn: 'National Guard', slug: 'national-guard' },
  { id: 'other', nameAr: 'أخرى', nameEn: 'Other', slug: 'other' },
];

// ═══════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * استخراج Dataset IDs من المحتوى HTML
 */
function extractDatasetIds(content: string): string[] {
  // Pattern 1: UUID in dataset view URLs
  const viewPattern = /\/datasets\/view\/([a-f0-9-]{36})/gi;
  const viewMatches = content.match(viewPattern) || [];

  // Pattern 2: UUID in data attributes
  const dataPattern = /data-id=["']([a-f0-9-]{36})["']/gi;
  const dataMatches = content.match(dataPattern) || [];

  // Pattern 3: UUID in href attributes
  const hrefPattern = /href=["'][^"']*([a-f0-9-]{36})[^"']*["']/gi;
  const hrefMatches = content.match(hrefPattern) || [];

  // Pattern 4: Any UUID (less reliable but catches more)
  const uuidPattern = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi;
  const uuidMatches = content.match(uuidPattern) || [];

  const allMatches = new Set<string>();

  // Extract IDs from view matches
  viewMatches.forEach((m) => {
    const id = m.replace('/datasets/view/', '').toLowerCase();
    if (id) allMatches.add(id);
  });

  // Extract IDs from data matches
  dataMatches.forEach((m) => {
    const match = m.match(/[a-f0-9-]{36}/i);
    if (match) allMatches.add(match[0].toLowerCase());
  });

  // Extract IDs from href matches
  hrefMatches.forEach((m) => {
    const match = m.match(/[a-f0-9-]{36}/i);
    if (match) allMatches.add(match[0].toLowerCase());
  });

  // Add UUID matches (filter common false positives)
  uuidMatches.forEach((id) => {
    const lowerId = id.toLowerCase();
    // Filter out common non-dataset UUIDs
    if (!lowerId.includes('0000-0000') && !lowerId.startsWith('00000000')) {
      allMatches.add(lowerId);
    }
  });

  return Array.from(allMatches);
}

/**
 * استخراج Dataset من استجابة API
 */
function extractDatasetsFromAPIResponse(responseBody: string): DatasetFromAPI[] {
  const datasets: DatasetFromAPI[] = [];

  try {
    const data = JSON.parse(responseBody);

    // Check different possible response structures
    const items = data.data || data.results || data.items || data.datasets || data;

    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        if (item.id || item.uuid || item.datasetId) {
          datasets.push({
            id: (item.id || item.uuid || item.datasetId).toString().toLowerCase(),
            titleAr: item.titleAr || item.title_ar || item.nameAr || item.name,
            titleEn: item.titleEn || item.title_en || item.nameEn,
            category: item.category?.titleAr || item.categoryAr || item.category,
            organization: item.organization?.titleAr || item.organizationAr || item.publisher,
          });
        }
      });
    }

    // Also check for nested datasets
    if (data.content && Array.isArray(data.content)) {
      data.content.forEach((item: any) => {
        if (item.id) {
          datasets.push({
            id: item.id.toString().toLowerCase(),
            titleAr: item.titleAr || item.title,
            titleEn: item.titleEn,
            category: item.category?.titleAr,
          });
        }
      });
    }
  } catch (e) {
    // Not valid JSON, ignore
  }

  return datasets;
}

// ═══════════════════════════════════════════════════════════════════
// Main Discovery Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * اكتشاف Datasets مع اعتراض طلبات الشبكة
 * Uses network interception to capture API responses
 */
async function discoverWithNetworkInterception(
  page: puppeteer.Page,
  url: string,
  maxScrolls: number = MAX_SCROLL_ATTEMPTS
): Promise<{ ids: Set<string>; apiDatasets: DatasetFromAPI[] }> {
  const allIds = new Set<string>();
  const apiDatasets: DatasetFromAPI[] = [];
  const capturedAPIs: string[] = [];

  // Setup network interception
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    request.continue();
  });

  page.on('response', async (response) => {
    const url = response.url();

    // Capture API responses that might contain dataset information
    if (
      url.includes('/api/') ||
      url.includes('/data/') ||
      url.includes('datasets') ||
      url.includes('search')
    ) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const body = await response.text();

          // Try to extract datasets from API response
          const datasets = extractDatasetsFromAPIResponse(body);
          if (datasets.length > 0) {
            datasets.forEach((d) => {
              allIds.add(d.id);
              apiDatasets.push(d);
            });

            if (!capturedAPIs.includes(url)) {
              capturedAPIs.push(url);
              logger.info(`   📡 API captured: ${url.substring(0, 80)}... (${datasets.length} datasets)`);
            }
          }

          // Also extract IDs from raw JSON
          const idsFromJson = body.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
          idsFromJson.forEach((id) => allIds.add(id.toLowerCase()));
        }
      } catch (e) {
        // Response body might not be available
      }
    }
  });

  try {
    logger.info(`   🌐 Loading: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PAGE_LOAD_TIMEOUT,
    });

    // Wait for dynamic content
    await delay(5000);

    // Extract IDs from initial page content
    let content = await page.content();
    extractDatasetIds(content).forEach((id) => allIds.add(id));
    logger.info(`   📄 Initial: ${allIds.size} datasets`);

    // Scroll to load more content
    let previousCount = allIds.size;
    let noChangeCount = 0;
    let scrollAttempts = 0;
    let currentPage = 1;
    let paginationFailed = false;

    while (scrollAttempts < maxScrolls && noChangeCount < 5) {
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await delay(SCROLL_DELAY);

      // Try to click "Load More" or "Show More" buttons
      try {
        const loadMoreSelectors = [
          'button[class*="load-more"]',
          'button[class*="show-more"]',
          '.load-more',
          '.show-more',
          '[ng-click*="loadMore"]',
          '[ng-click*="showMore"]',
          'a[class*="more"]',
          'button:contains("المزيد")',
          'button:contains("تحميل المزيد")',
          'button:contains("عرض المزيد")',
        ];

        for (const selector of loadMoreSelectors) {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            await delay(SCROLL_DELAY);
            logger.info(`   🔘 Clicked load more button`);
            break;
          }
        }
      } catch {
        // No button found
      }

      // Try MULTIPLE pagination selectors
      if (!paginationFailed) {
        try {
          const paginationSelectors = [
            'a.page-link:not(.disabled)',
            '.pagination a[aria-label="Next"]',
            '.next-page',
            'a[rel="next"]',
            '.pagination li:not(.disabled) a:contains("التالي")',
            '.pagination li:not(.disabled) a:contains("Next")',
            'button[aria-label="Next page"]',
            '.pagination-next:not(.disabled)',
            'a.pagination__next',
            '[class*="pagination"] [class*="next"]:not([disabled])',
            'nav[aria-label="pagination"] a:last-child',
          ];

          let clicked = false;
          for (const selector of paginationSelectors) {
            try {
              const nextPageButton = await page.$(selector);
              if (nextPageButton) {
                const isDisabled = await page.evaluate((el) => {
                  return el.classList.contains('disabled') ||
                         el.getAttribute('disabled') !== null ||
                         el.getAttribute('aria-disabled') === 'true';
                }, nextPageButton);

                if (!isDisabled) {
                  await nextPageButton.click();
                  await delay(REQUEST_DELAY);
                  currentPage++;
                  logger.info(`   📄 Navigated to page ${currentPage}`);
                  clicked = true;
                  noChangeCount = 0; // Reset counter on successful page navigation
                  break;
                }
              }
            } catch {
              continue;
            }
          }

          if (!clicked) {
            // If no pagination button found, try URL-based pagination
            paginationFailed = true;
          }
        } catch {
          paginationFailed = true;
        }
      }

      // Extract new IDs
      content = await page.content();
      extractDatasetIds(content).forEach((id) => allIds.add(id));

      if (allIds.size === previousCount) {
        noChangeCount++;
      } else {
        if (scrollAttempts % 10 === 0 || allIds.size - previousCount > 10) {
          logger.info(`   📜 Page ${currentPage}, Scroll ${scrollAttempts}: ${allIds.size} datasets (+${allIds.size - previousCount})`);
        }
        noChangeCount = 0;
      }

      previousCount = allIds.size;
      scrollAttempts++;
    }

    logger.info(`   ✅ Discovery complete: ${allIds.size} datasets found (${currentPage} pages)`);
    if (capturedAPIs.length > 0) {
      logger.info(`   📡 Captured ${capturedAPIs.length} API endpoints`);
    }

  } catch (error) {
    logger.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return { ids: allIds, apiDatasets };
}

/**
 * اكتشاف من خلال التنقل بين صفحات الـ Pagination مباشرة
 * Uses URL-based pagination to iterate through ALL pages
 */
async function discoverWithURLPagination(
  page: puppeteer.Page,
  baseUrl: string,
  maxPages: number = 500,
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<{ ids: Set<string>; apiDatasets: DatasetFromAPI[] }> {
  const allIds = new Set<string>();
  const allApiDatasets: DatasetFromAPI[] = [];
  let consecutiveEmptyPages = 0;
  const MAX_EMPTY_PAGES = 3;

  logger.info(`\n📄 Starting URL-based pagination discovery...`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    // Try different pagination URL formats
    const paginationUrls = [
      `${baseUrl}?page=${pageNum}`,
      `${baseUrl}?p=${pageNum}`,
      `${baseUrl}?offset=${(pageNum - 1) * 20}`,
      `${baseUrl}&page=${pageNum}`,
    ];

    let pageFound = false;

    for (const url of paginationUrls) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: PAGE_LOAD_TIMEOUT,
        });

        await delay(3000);

        const content = await page.content();
        const pageIds = extractDatasetIds(content);

        if (pageIds.length > 0) {
          const newCount = pageIds.filter((id) => !allIds.has(id)).length;
          pageIds.forEach((id) => allIds.add(id));

          if (newCount > 0) {
            consecutiveEmptyPages = 0;
            logger.info(`   📄 Page ${pageNum}: +${newCount} new (total: ${allIds.size})`);

            if (onProgress) {
              onProgress({
                category: 'pagination',
                page: pageNum,
                found: newCount,
                total: allIds.size,
              });
            }
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

    // Stop if we've had multiple empty pages in a row
    if (consecutiveEmptyPages >= MAX_EMPTY_PAGES) {
      logger.info(`   ✅ Pagination complete: No new datasets for ${MAX_EMPTY_PAGES} consecutive pages`);
      break;
    }

    await delay(REQUEST_DELAY);
  }

  return { ids: allIds, apiDatasets: allApiDatasets };
}

/**
 * اكتشاف من عدة صفحات مع أنماط بحث مختلفة
 */
async function discoverFromMultiplePages(
  page: puppeteer.Page,
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<{ ids: Set<string>; apiDatasets: DatasetFromAPI[] }> {
  const allIds = new Set<string>();
  const allApiDatasets: DatasetFromAPI[] = [];

  // Different URL patterns to try
  const urlPatterns = [
    `${DATASETS_URL}`,
    `${DATASETS_URL}?page=1&size=100`,
    `${DATASETS_URL}?limit=100&offset=0`,
    `${BASE_URL}/ar/datasets?sort=newest`,
    `${BASE_URL}/ar/datasets?sort=popular`,
    `${BASE_URL}/ar/search?type=dataset`,
  ];

  // Also try search with common letters to get different results
  const searchTerms = ['ا', 'ب', 'ت', 'م', 'ع', 'س', 'ح', 'و', 'ن', 'ل'];
  searchTerms.forEach((term) => {
    urlPatterns.push(`${BASE_URL}/ar/datasets?q=${encodeURIComponent(term)}`);
  });

  // Try each URL pattern
  for (let i = 0; i < urlPatterns.length; i++) {
    const url = urlPatterns[i];

    try {
      logger.info(`\n📄 Pattern ${i + 1}/${urlPatterns.length}: ${url.substring(0, 60)}...`);

      const { ids, apiDatasets } = await discoverWithNetworkInterception(page, url, 30);

      const newCount = Array.from(ids).filter((id) => !allIds.has(id)).length;
      ids.forEach((id) => allIds.add(id));
      apiDatasets.forEach((d) => allApiDatasets.push(d));

      logger.info(`   📊 Found ${ids.size} (new: ${newCount}, total: ${allIds.size})`);

      if (onProgress) {
        onProgress({
          category: 'متعدد',
          page: i + 1,
          found: ids.size,
          total: allIds.size,
        });
      }

      await delay(REQUEST_DELAY);
    } catch (error) {
      logger.error(`   ❌ Error with pattern: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // NEW: Try URL-based pagination for comprehensive discovery
  logger.info('\n══════ المرحلة الإضافية: Pagination بالـ URL ══════');
  const { ids: paginationIds } = await discoverWithURLPagination(page, DATASETS_URL, 500, onProgress);
  const newFromPagination = Array.from(paginationIds).filter((id) => !allIds.has(id)).length;
  paginationIds.forEach((id) => allIds.add(id));
  logger.info(`   📊 بعد Pagination: ${allIds.size} (جديد: ${newFromPagination})`);

  return { ids: allIds, apiDatasets: allApiDatasets };
}

/**
 * اكتشاف كل الـ Datasets من كل الأقسام
 * Discover ALL datasets from ALL categories
 */
export async function discoverAllDatasets(
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<string[]> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('🔍 بدء اكتشاف شامل لكل الـ Datasets - النسخة المحسنة v3');
  logger.info('📌 التحسينات: Pagination كامل + كل الأقسام + اعتراض API');
  logger.info(`📊 عدد الأقسام: ${SAUDI_DATA_CATEGORIES.length}`);
  logger.info('═══════════════════════════════════════════════════════');

  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN غير موجود - أضفه في Environment Variables');
    return [];
  }

  const allIds = new Set<string>();
  const allApiDatasets: DatasetFromAPI[] = [];
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

    // First: Try multiple page patterns
    logger.info('\n══════ المرحلة 1: البحث بأنماط متعددة ══════');
    const { ids: patternIds, apiDatasets: patternDatasets } = await discoverFromMultiplePages(page, onProgress);
    patternIds.forEach((id) => allIds.add(id));
    patternDatasets.forEach((d) => allApiDatasets.push(d));
    logger.info(`📊 بعد البحث بأنماط متعددة: ${allIds.size} dataset`);

    // Second: Deep scroll on main page
    logger.info('\n══════ المرحلة 2: التمرير العميق ══════');
    const { ids: scrollIds } = await discoverWithNetworkInterception(page, DATASETS_URL, MAX_SCROLL_ATTEMPTS);
    const newFromScroll = Array.from(scrollIds).filter((id) => !allIds.has(id)).length;
    scrollIds.forEach((id) => allIds.add(id));
    logger.info(`📊 بعد التمرير العميق: ${allIds.size} dataset (جديد: ${newFromScroll})`);

    // Third: Try each category with FULL PAGINATION
    logger.info('\n══════ المرحلة 3: البحث في كل قسم مع Pagination كامل ══════');
    for (const category of SAUDI_DATA_CATEGORIES) {
      try {
        logger.info(`📁 قسم: ${category.nameAr}`);
        const categoryStartCount = allIds.size;

        // Try different category URL patterns
        const categoryUrls = [
          `${DATASETS_URL}?category=${category.id}`,
          `${DATASETS_URL}?category=${encodeURIComponent(category.nameAr)}`,
          `${BASE_URL}/ar/datasets?filter[category]=${category.id}`,
          `${BASE_URL}/ar/search?type=dataset&category=${category.id}`,
        ];

        // First, find which URL pattern works
        let workingUrl = '';
        for (const url of categoryUrls) {
          try {
            const { ids } = await discoverWithNetworkInterception(page, url, 5);
            if (ids.size > 0) {
              workingUrl = url;
              ids.forEach((id) => allIds.add(id));
              break;
            }
          } catch {
            continue;
          }
        }

        // If we found a working URL, paginate through ALL pages
        if (workingUrl) {
          const { ids: categoryIds } = await discoverWithURLPagination(
            page,
            workingUrl,
            100, // Max 100 pages per category
            onProgress
          );
          categoryIds.forEach((id) => allIds.add(id));
        }

        const categoryNewCount = allIds.size - categoryStartCount;
        if (categoryNewCount > 0) {
          logger.info(`   ✅ ${category.nameAr}: +${categoryNewCount} جديد (إجمالي: ${allIds.size})`);
        }

        if (onProgress) {
          onProgress({
            category: category.nameAr,
            page: 1,
            found: categoryNewCount,
            total: allIds.size,
          });
        }

        await delay(REQUEST_DELAY);
      } catch (error) {
        logger.error(`   ❌ خطأ في قسم ${category.nameAr}`);
      }
    }

    await page.close();

    // Log final stats
    logger.info('\n═══════════════════════════════════════════════════════');
    logger.info('📊 ملخص الاكتشاف النهائي:');
    logger.info(`   📁 إجمالي الـ Datasets: ${allIds.size}`);
    logger.info(`   📡 Datasets من API: ${allApiDatasets.length}`);
    logger.info('═══════════════════════════════════════════════════════');

    return Array.from(allIds);
  } catch (error) {
    logger.error(`❌ خطأ في الاكتشاف الشامل: ${error instanceof Error ? error.message : 'Unknown'}`);
    return Array.from(allIds);
  } finally {
    if (browser) {
      browser.disconnect();
    }
  }
}

/**
 * اكتشاف سريع - الصفحة الرئيسية فقط (للاستخدام المتكرر)
 */
export async function discoverDatasets(): Promise<string[]> {
  logger.info('🔍 بدء اكتشاف سريع (الصفحة الرئيسية + scroll)...');

  if (!BROWSERLESS_TOKEN) {
    logger.error('❌ BROWSERLESS_TOKEN غير موجود');
    return [];
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${BROWSERLESS_URL}${BROWSERLESS_TOKEN}`,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const { ids } = await discoverWithNetworkInterception(page, DATASETS_URL, 50);
    await page.close();

    logger.info(`✅ تم اكتشاف ${ids.size} dataset`);
    return Array.from(ids);
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
export async function findNewDatasets(fullDiscovery: boolean = false): Promise<DiscoveryResult> {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info(`🔍 بدء عملية اكتشاف Datasets جديدة (${fullDiscovery ? 'شامل' : 'سريع'})`);
  logger.info('═══════════════════════════════════════════════════════');

  // Get known IDs from database
  const existingDatasets = await prisma.dataset.findMany({
    select: { externalId: true },
  });
  const knownIds = new Set(existingDatasets.map((d) => d.externalId));

  logger.info(`📋 الـ Datasets المعروفة في قاعدة البيانات: ${knownIds.size}`);

  // Discover from website
  const discoveredIds = fullDiscovery
    ? await discoverAllDatasets()
    : await discoverDatasets();

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
    newIds.slice(0, 20).forEach((id, i) => {
      logger.info(`   ${i + 1}. ${id}`);
    });
    if (newIds.length > 20) {
      logger.info(`   ... و ${newIds.length - 20} أخرى`);
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
          newIds: newIds.slice(0, 100),
          fullDiscovery,
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
 * إضافة Datasets جديدة مع جلب المعلومات من الـ API
 */
export async function addNewDatasets(datasetIds: string[]): Promise<number> {
  logger.info(`📝 إضافة ${datasetIds.length} dataset جديدة...`);

  let added = 0;
  const batchSize = 10;

  for (let i = 0; i < datasetIds.length; i += batchSize) {
    const batch = datasetIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (externalId) => {
        try {
          const existing = await prisma.dataset.findUnique({
            where: { externalId },
          });

          if (!existing) {
            // Try to fetch metadata from API
            let name = `Dataset ${externalId.substring(0, 8)}`;
            let nameAr = `مجموعة بيانات ${externalId.substring(0, 8)}`;
            let category = 'أخرى';

            try {
              const response = await fetch(
                `https://open.data.gov.sa/data/api/datasets?version=-1&dataset=${externalId}`,
                {
                  headers: { Accept: 'application/json' },
                }
              );

              if (response.ok) {
                const data = await response.json();
                if (data) {
                  name = data.titleEn || name;
                  nameAr = data.titleAr || nameAr;
                  category = data.categories?.[0]?.titleAr || category;
                }
              }
            } catch {
              // Use default values if API fails
            }

            await prisma.dataset.create({
              data: {
                externalId,
                name,
                nameAr,
                category,
                syncStatus: 'PENDING',
              },
            });
            added++;
            logger.info(`   ➕ ${nameAr} (${externalId.substring(0, 8)}...)`);
          }
        } catch (error) {
          logger.error(`   ❌ فشل إضافة ${externalId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      })
    );

    // Progress update
    if (i + batchSize < datasetIds.length) {
      logger.info(`   📊 Progress: ${Math.min(i + batchSize, datasetIds.length)}/${datasetIds.length}`);
    }

    await delay(500);
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

  // Get category breakdown
  const categoryBreakdown = await prisma.dataset.groupBy({
    by: ['category'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const lastDiscovery = await prisma.syncLog.findFirst({
    where: { jobType: 'discovery' },
    orderBy: { startedAt: 'desc' },
  });

  const totalRecords = await prisma.dataRecord.count();

  return {
    datasets: {
      total: totalDatasets,
      synced: syncedDatasets,
      pending: pendingDatasets,
      failed: failedDatasets,
    },
    categories: categoryBreakdown.map((c) => ({
      name: c.category,
      count: c._count.id,
    })),
    availableCategories: SAUDI_DATA_CATEGORIES.length,
    records: totalRecords,
    lastDiscovery: lastDiscovery?.startedAt || null,
    lastDiscoveryResult: lastDiscovery?.metadata ? JSON.parse(lastDiscovery.metadata as string) : null,
    browserlessConfigured: !!BROWSERLESS_TOKEN,
    platformInfo: {
      name: 'منصة البيانات المفتوحة السعودية',
      url: 'https://open.data.gov.sa',
      estimatedTotal: '15,500+',
    },
  };
}

/**
 * الحصول على قائمة الأقسام المتاحة
 */
export function getAvailableCategories(): CategoryInfo[] {
  return SAUDI_DATA_CATEGORIES;
}

export default {
  discoverDatasets,
  discoverAllDatasets,
  findNewDatasets,
  addNewDatasets,
  getDiscoveryStats,
  getAvailableCategories,
  SAUDI_DATA_CATEGORIES,
};
