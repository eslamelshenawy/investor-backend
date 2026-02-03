const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});
async function main() {
  const total = await prisma.dataset.count();
  const active = await prisma.dataset.count({ where: { isActive: true } });
  const withUUID = await prisma.dataset.count({ where: { id: { contains: '-' } } });
  const activeWithUUID = await prisma.dataset.count({ where: { isActive: true, id: { contains: '-' } } });
  
  console.log('Total datasets:', total);
  console.log('Active datasets:', active);
  console.log('With UUID format:', withUUID);
  console.log('Active + UUID:', activeWithUUID);
  await prisma.$disconnect();
}
main();
