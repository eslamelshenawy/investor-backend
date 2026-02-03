/**
 * Fetch Missing Metadata - Script 1 of 6
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

const SCRIPT_NUM = 3;
const TOTAL_SCRIPTS = 6;
const API_BASE = 'https://open.data.gov.sa/api/3/action/package_show';

async function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchMetadata(externalId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}?id=${externalId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.result || data;
  } catch { return null; }
}

function transformMetadata(apiData: any): any {
  if (!apiData) return null;
  return {
    datasetID: apiData.id,
    titleAr: apiData.title || apiData.name,
    titleEn: apiData.title_translated?.en || apiData.name,
    descriptionAr: apiData.notes,
    descriptionEn: apiData.notes_translated?.en,
    tags: apiData.tags?.map((t: any) => ({ name: t.name || t.display_name, tagID: t.id })) || [],
    categories: apiData.groups?.map((g: any) => ({ name: g.name, titleAr: g.title, categoryID: g.id })) || [],
    resources: apiData.resources?.map((r: any) => ({ resourceID: r.id, name: r.name, url: r.url, format: r.format })) || [],
    publisherNameAr: apiData.organization?.title,
    publisherNameEn: apiData.organization?.title_translated?.en,
    publisherId: apiData.organization?.id,
    createdAt: apiData.metadata_created,
    updatedAt: apiData.metadata_modified,
    status: 'APPROVED', type: 'FILE'
  };
}

async function main() {
  console.log(`🚀 Script ${SCRIPT_NUM}/${TOTAL_SCRIPTS}`);

  // Use raw query to find datasets with NULL metadata
  const allMissing: any[] = await prisma.$queryRaw`
    SELECT id, external_id as "externalId", name_ar as "nameAr"
    FROM datasets
    WHERE metadata IS NULL AND is_active = true
    ORDER BY created_at ASC
  `;

  console.log(`📊 Total missing: ${allMissing.length}`);

  const chunkSize = Math.ceil(allMissing.length / TOTAL_SCRIPTS);
  const start = (SCRIPT_NUM - 1) * chunkSize;
  const end = Math.min(start + chunkSize, allMissing.length);
  const myChunk = allMissing.slice(start, end);

  console.log(`📦 Processing: ${myChunk.length} (${start + 1} to ${end})`);

  let success = 0, failed = 0;
  for (let i = 0; i < myChunk.length; i++) {
    const ds = myChunk[i];
    try {
      const apiData = await fetchMetadata(ds.externalId);
      if (apiData) {
        const metadata = transformMetadata(apiData);
        await prisma.dataset.update({
          where: { id: ds.id },
          data: {
            metadata,
            nameAr: metadata.titleAr || ds.nameAr,
            name: metadata.titleEn || metadata.titleAr,
            descriptionAr: metadata.descriptionAr,
            description: metadata.descriptionEn || metadata.descriptionAr,
            source: metadata.publisherNameAr || 'open.data.gov.sa',
            syncStatus: 'SUCCESS'
          }
        });
        success++;
        if ((i + 1) % 20 === 0) console.log(`✅ [${i + 1}/${myChunk.length}] Success: ${success}`);
      } else { failed++; }
      await delay(150);
    } catch (e: any) {
      failed++;
      console.log(`❌ Error: ${e.message?.substring(0, 50)}`);
    }
  }

  console.log(`\n✅ Done! Success: ${success} | Failed: ${failed}`);
  await prisma.$disconnect();
}

main();
