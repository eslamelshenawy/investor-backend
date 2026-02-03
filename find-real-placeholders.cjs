const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  // Real placeholders are: "مجموعة بيانات" + space + 8 hex chars only
  // Pattern: مجموعة بيانات [a-f0-9]{8}
  
  const realPlaceholders = await prisma.$queryRaw`
    SELECT id, name_ar, external_id, metadata IS NOT NULL as has_metadata
    FROM datasets 
    WHERE name_ar ~ '^مجموعة بيانات [a-f0-9]{8}$'
  `;
  
  console.log('Real placeholders (just ID):', realPlaceholders.length);
  realPlaceholders.slice(0, 5).forEach(p => {
    console.log(' -', p.name_ar, '| has_metadata:', p.has_metadata);
  });
  
  // Legitimate names starting with "مجموعة بيانات"
  const legitimate = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM datasets 
    WHERE name_ar LIKE 'مجموعة بيانات%'
    AND name_ar !~ '^مجموعة بيانات [a-f0-9]{8}$'
  `;
  
  console.log('\nLegitimate names starting with "مجموعة بيانات":', legitimate[0].count);
  
  await prisma.$disconnect();
}
check();
