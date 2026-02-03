/**
 * Discover datasets for "المساحة والخرائط" using CKAN API
 *
 * Usage: npx ts-node scripts/discover-maps-api.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

const BASE_URL = 'https://open.data.gov.sa';
const CATEGORY_NAME = 'المساحة والخرائط';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

interface DatasetFromAPI {
  id: string;
  title?: string;
  titleAr?: string;
  name?: string;
}

/**
 * Fetch datasets using the site's data API
 */
async function fetchFromAPI(): Promise<DatasetFromAPI[]> {
  const allDatasets: DatasetFromAPI[] = [];
  const foundIds = new Set<string>();

  // Try various API endpoints
  const apiEndpoints = [
    // CKAN standard API
    `${BASE_URL}/data/api/3/action/package_search?q=*:*&fq=groups:${encodeURIComponent(CATEGORY_NAME)}&rows=1000`,
    `${BASE_URL}/data/api/3/action/package_search?fq=groups:area-and-maps&rows=1000`,
    `${BASE_URL}/data/api/3/action/package_list`,
    `${BASE_URL}/data/api/3/action/group_show?id=area-and-maps&include_datasets=true`,
    `${BASE_URL}/data/api/3/action/group_package_show?id=${encodeURIComponent(CATEGORY_NAME)}&limit=1000`,
    // Custom API endpoints
    `${BASE_URL}/api/datasets?category=${encodeURIComponent(CATEGORY_NAME)}&limit=1000`,
    `${BASE_URL}/api/v1/datasets?category=${encodeURIComponent(CATEGORY_NAME)}&limit=1000`,
    `${BASE_URL}/data/api/datasets?version=-1&category=${encodeURIComponent(CATEGORY_NAME)}`,
  ];

  for (const endpoint of apiEndpoints) {
    try {
      console.log(`   📡 Trying: ${endpoint.substring(0, 70)}...`);

      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const data = await response.json();

        // Extract datasets from various response structures
        let items: any[] = [];

        if (data.result?.results) items = data.result.results;
        else if (data.result?.packages) items = data.result.packages;
        else if (data.result && Array.isArray(data.result)) items = data.result;
        else if (data.results) items = data.results;
        else if (data.data) items = data.data;
        else if (data.datasets) items = data.datasets;
        else if (Array.isArray(data)) items = data;

        if (items.length > 0) {
          console.log(`   ✅ Found ${items.length} items`);

          for (const item of items) {
            const id = (item.id || item.uuid || item.name || '').toString().toLowerCase();
            if (id && id.includes('-') && !foundIds.has(id)) {
              foundIds.add(id);
              allDatasets.push({
                id,
                title: item.title || item.name || '',
                titleAr: item.title_ar || item.titleAr || item.title || item.name || ''
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.log(`   ⚠️ Error: ${err.message}`);
    }

    await delay(1000);
  }

  return allDatasets;
}

/**
 * Fetch using pagination
 */
async function fetchWithPagination(): Promise<DatasetFromAPI[]> {
  const allDatasets: DatasetFromAPI[] = [];
  const foundIds = new Set<string>();

  console.log('\n📄 Trying paginated API requests...');

  // Try CKAN paginated search
  for (let offset = 0; offset < 500; offset += 50) {
    try {
      const url = `${BASE_URL}/data/api/3/action/package_search?q=*:*&rows=50&start=${offset}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const results = data.result?.results || [];

        if (results.length === 0) {
          console.log(`   ✅ Pagination complete at offset ${offset}`);
          break;
        }

        let newCount = 0;
        for (const item of results) {
          const id = (item.id || '').toString().toLowerCase();
          // Filter by category if present
          const categories = item.groups?.map((g: any) => g.title || g.name) || [];
          const hasCategory = categories.some((c: string) =>
            c.includes(CATEGORY_NAME) || c.includes('area') || c.includes('maps')
          );

          if (id && id.includes('-') && !foundIds.has(id)) {
            if (hasCategory || categories.length === 0) { // Include if matches category or no category info
              foundIds.add(id);
              allDatasets.push({
                id,
                title: item.title || item.name || '',
                titleAr: item.title_ar || item.titleAr || item.title || ''
              });
              if (hasCategory) newCount++;
            }
          }
        }

        if (newCount > 0) {
          console.log(`   📄 Offset ${offset}: +${newCount} matching category`);
        }
      }
    } catch {}

    await delay(500);
  }

  return allDatasets;
}

/**
 * Save discovered datasets to database
 */
async function saveToDatabase(datasets: DatasetFromAPI[]): Promise<void> {
  console.log(`\n💾 Saving ${datasets.length} datasets to database...`);

  let created = 0, updated = 0, skipped = 0;

  for (const ds of datasets) {
    try {
      const existing = await prisma.dataset.findFirst({ where: { externalId: ds.id } });

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
            externalId: ds.id,
            name: ds.title || `Dataset ${ds.id.substring(0, 8)}`,
            nameAr: ds.titleAr || `مجموعة بيانات ${ds.id.substring(0, 8)}`,
            description: '',
            descriptionAr: '',
            category: CATEGORY_NAME,
            source: 'البيانات المفتوحة السعودية',
            sourceUrl: `${BASE_URL}/ar/datasets/view/${ds.id}`,
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
  console.log(`🚀 Maps Category Discovery (API)
📍 Category: ${CATEGORY_NAME}`);
  console.log('═'.repeat(60));

  const before = await prisma.dataset.count({ where: { category: CATEGORY_NAME, isActive: true } });
  console.log(`📊 Current count in DB: ${before}\n`);

  console.log('🔍 Trying to access CKAN API...');
  const apiDatasets = await fetchFromAPI();
  console.log(`📊 Found from direct API: ${apiDatasets.length}`);

  const paginatedDatasets = await fetchWithPagination();
  console.log(`📊 Found from paginated API: ${paginatedDatasets.length}`);

  // Merge all datasets
  const allIds = new Set<string>();
  const allDatasets: DatasetFromAPI[] = [];

  for (const ds of [...apiDatasets, ...paginatedDatasets]) {
    if (!allIds.has(ds.id)) {
      allIds.add(ds.id);
      allDatasets.push(ds);
    }
  }

  console.log(`\n📊 Total unique: ${allDatasets.length}`);

  if (allDatasets.length > 0) {
    await saveToDatabase(allDatasets);

    const after = await prisma.dataset.count({ where: { category: CATEGORY_NAME, isActive: true } });
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Final count: ${after} (+${after - before})`);
    console.log('═'.repeat(60));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
