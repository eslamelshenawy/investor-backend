const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  console.log('=== الحالة النهائية ===\n');
  
  const total = await prisma.dataset.count({ where: { isActive: true } });
  const withMetadata = await prisma.dataset.count({ 
    where: { isActive: true, metadata: { not: null } } 
  });
  const placeholders = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM datasets 
    WHERE name_ar ~ '^مجموعة بيانات [a-f0-9]{8}$'
  `;
  
  console.log('Total active datasets:', total);
  console.log('With metadata (will show in dashboards):', withMetadata);
  console.log('Placeholder datasets remaining:', placeholders[0].count);
  
  await prisma.$disconnect();
}
check();
