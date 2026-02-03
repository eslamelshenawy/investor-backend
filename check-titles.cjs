const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  const samples = await prisma.$queryRaw`
    SELECT id, name_ar, metadata->>'titleAr' as title_ar, metadata->>'titleEn' as title_en
    FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%' 
    AND metadata IS NOT NULL 
    AND metadata != 'null'::jsonb
    LIMIT 5
  `;
  
  console.log('Samples:');
  samples.forEach((s, i) => {
    console.log('\n---', i+1, '---');
    console.log('nameAr:', s.name_ar);
    console.log('titleAr:', s.title_ar);
    console.log('titleEn:', s.title_en);
  });
  
  await prisma.$disconnect();
}
check();
