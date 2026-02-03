const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function explore() {
  console.log('=== استكشاف عمود metadata ===\n');
  
  // Count datasets with metadata
  const withMetadata = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM datasets WHERE metadata IS NOT NULL AND metadata != 'null'::jsonb
  `;
  console.log('Datasets with metadata:', withMetadata[0].count);
  
  // Get sample with metadata
  const samples = await prisma.$queryRaw`
    SELECT id, name_ar, metadata 
    FROM datasets 
    WHERE metadata IS NOT NULL AND metadata != 'null'::jsonb
    LIMIT 3
  `;
  
  console.log('\nعينات من metadata:');
  samples.forEach((s, i) => {
    console.log('\n--- Sample', i+1, '---');
    console.log('nameAr:', s.name_ar);
    console.log('metadata:', JSON.stringify(s.metadata, null, 2));
  });
  
  await prisma.$disconnect();
}
explore();
