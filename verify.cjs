const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function main() {
  const count = await prisma.dataset.count({ 
    where: { category: 'المساحة والخرائط', isActive: true } 
  });
  console.log('العدد الحالي في قاعدة البيانات:', count);
  
  const recent = await prisma.dataset.findMany({
    where: { category: 'المساحة والخرائط', isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { externalId: true, nameAr: true, syncStatus: true }
  });
  
  console.log('\nآخر 5 datasets تمت إضافتها:');
  recent.forEach((d, i) => {
    console.log('  ' + (i+1) + '. ' + d.nameAr + ' [' + d.syncStatus + ']');
  });
  
  await prisma.$disconnect();
}
main();
