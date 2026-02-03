const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});
async function main() {
  const total = await prisma.dataset.count({ where: { category: 'المساحة والخرائط' } });
  const active = await prisma.dataset.count({ where: { category: 'المساحة والخرائط', isActive: true } });
  const withUUID = await prisma.dataset.count({ where: { category: 'المساحة والخرائط', id: { contains: '-' } } });
  
  console.log('المساحة والخرائط:');
  console.log('  Total:', total);
  console.log('  Active:', active);  
  console.log('  With UUID (shown in dashboards):', withUUID);
  await prisma.$disconnect();
}
main();
