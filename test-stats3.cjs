const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function test() {
  try {
    console.log('Testing without where clause...\n');
    
    // Just group by without filter, then filter in code
    const categoriesData = await prisma.dataset.groupBy({
      by: ['category']
    });
    
    // Filter out null in code
    const validCategories = categoriesData.filter(c => c.category !== null);
    
    console.log('✅ Total groups:', categoriesData.length);
    console.log('   Valid categories:', validCategories.length);
    console.log('   Sample:', validCategories.slice(0, 3));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
