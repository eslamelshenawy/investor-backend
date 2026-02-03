const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function fix() {
  console.log('=== إصلاح الأسماء من metadata ===\n');
  
  // Get placeholders with metadata
  const toFix = await prisma.$queryRaw`
    SELECT id, name_ar, metadata 
    FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%' 
    AND metadata IS NOT NULL 
    AND metadata != 'null'::jsonb
    AND metadata->>'titleAr' IS NOT NULL
  `;
  
  console.log('Found', toFix.length, 'datasets to fix');
  
  let fixed = 0;
  for (const d of toFix) {
    const titleAr = d.metadata.titleAr;
    const titleEn = d.metadata.titleEn;
    
    if (titleAr && titleAr !== d.name_ar) {
      await prisma.dataset.update({
        where: { id: d.id },
        data: { 
          nameAr: titleAr,
          name: titleEn || titleAr
        }
      });
      fixed++;
      console.log('Fixed:', titleAr.substring(0, 50) + '...');
    }
  }
  
  console.log('\n✅ Fixed', fixed, 'datasets');
  
  // Check remaining placeholders
  const remaining = await prisma.dataset.count({
    where: { nameAr: { startsWith: 'مجموعة بيانات' } }
  });
  console.log('Remaining placeholders:', remaining);
  
  await prisma.$disconnect();
}
fix();
