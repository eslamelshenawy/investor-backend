const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  const placeholder = await prisma.dataset.count({
    where: { nameAr: { startsWith: 'مجموعة بيانات' } }
  });
  
  const real = await prisma.dataset.count({
    where: { NOT: { nameAr: { startsWith: 'مجموعة بيانات' } } }
  });
  
  console.log('Datasets with placeholder "مجموعة بيانات":', placeholder);
  console.log('Datasets with REAL names:', real);
  
  const samples = await prisma.dataset.findMany({
    where: { NOT: { nameAr: { startsWith: 'مجموعة بيانات' } } },
    select: { nameAr: true, name: true },
    take: 5
  });
  console.log('\nSample REAL names:');
  samples.forEach(s => console.log('  -', s.nameAr || s.name));
  
  await prisma.$disconnect();
}
check();
