const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  console.log('=== فحص الـ datasets ذات الأسماء placeholder ===\n');
  
  // Get placeholder datasets with their metadata
  const placeholders = await prisma.$queryRaw`
    SELECT id, name_ar, external_id, metadata 
    FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%'
    LIMIT 3
  `;
  
  console.log('عدد العينات:', placeholders.length);
  
  placeholders.forEach((p, i) => {
    console.log('\n--- Dataset', i+1, '---');
    console.log('nameAr:', p.name_ar);
    console.log('externalId:', p.external_id);
    console.log('metadata:', p.metadata ? 'EXISTS' : 'NULL');
    if (p.metadata) {
      console.log('  titleAr:', p.metadata.titleAr);
      console.log('  titleEn:', p.metadata.titleEn);
    }
  });
  
  // Count placeholders with/without metadata
  const withMeta = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%' 
    AND metadata IS NOT NULL AND metadata != 'null'::jsonb
  `;
  
  const withoutMeta = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%' 
    AND (metadata IS NULL OR metadata = 'null'::jsonb)
  `;
  
  console.log('\n=== إحصائيات ===');
  console.log('Placeholders with metadata:', withMeta[0].count);
  console.log('Placeholders without metadata:', withoutMeta[0].count);
  
  await prisma.$disconnect();
}
check();
