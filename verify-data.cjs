const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function check() {
  console.log('=== التحقق من البيانات ===\n');
  
  const total = await prisma.dataset.count({ where: { isActive: true } });
  const withMetadata = await prisma.dataset.count({ 
    where: { isActive: true, metadata: { not: null } } 
  });
  
  console.log('Total datasets:', total);
  console.log('With metadata:', withMetadata);
  
  // Sample metadata
  const sample = await prisma.dataset.findFirst({
    where: { metadata: { not: null } },
    select: { nameAr: true, metadata: true }
  });
  
  if (sample && sample.metadata) {
    const meta = sample.metadata;
    console.log('\nSample metadata keys:', Object.keys(meta));
  }
  
  await prisma.$disconnect();
}
check();
