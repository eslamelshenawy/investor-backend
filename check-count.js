const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function main() {
  const count = await prisma.dataset.count({ 
    where: { category: 'المساحة والخرائط', isActive: true } 
  });
  console.log('Current count:', count);
  console.log('Target: 246');
  console.log('Gap:', 246 - count);
  await prisma.$disconnect();
}

main().catch(console.error);
