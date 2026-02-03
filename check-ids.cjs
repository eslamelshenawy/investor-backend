const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});
async function main() {
  // Sample datasets to see ID format
  const samples = await prisma.dataset.findMany({
    where: { category: 'المساحة والخرائط' },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, externalId: true, nameAr: true }
  });
  
  console.log('Sample IDs (المساحة والخرائط):');
  samples.forEach(s => {
    console.log('  id:', s.id);
    console.log('  externalId:', s.externalId);
    console.log('  ---');
  });
  await prisma.$disconnect();
}
main();
