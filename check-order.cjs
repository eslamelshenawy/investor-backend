const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  // Get the most recently synced datasets (what dashboard shows first)
  const recent = await prisma.dataset.findMany({
    orderBy: { lastSyncAt: 'desc' },
    take: 10,
    select: { nameAr: true, name: true, lastSyncAt: true, createdAt: true }
  });
  
  console.log('Most recent datasets (what Dashboard shows):');
  recent.forEach((d, i) => {
    console.log((i+1) + '.', d.nameAr || d.name);
    console.log('   lastSyncAt:', d.lastSyncAt);
  });
  
  // Check if placeholder ones have NULL lastSyncAt
  const placeholderWithNull = await prisma.dataset.count({
    where: { 
      nameAr: { startsWith: 'مجموعة بيانات' },
      lastSyncAt: null
    }
  });
  console.log('\nPlaceholder names with NULL lastSyncAt:', placeholderWithNull);
  
  await prisma.$disconnect();
}
check();
