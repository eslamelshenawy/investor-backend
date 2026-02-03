const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function test() {
  try {
    console.log('Testing stats queries...\n');
    
    // Test each query individually
    console.log('1. Count datasets...');
    const totalDatasets = await prisma.dataset.count();
    console.log('   Total datasets:', totalDatasets);
    
    console.log('2. Group by category...');
    const categoriesData = await prisma.dataset.groupBy({
      by: ['category'],
      where: { category: { not: null } }
    });
    console.log('   Categories:', categoriesData.length);
    
    console.log('3. Count signals...');
    const totalSignals = await prisma.signal.count();
    console.log('   Signals:', totalSignals);
    
    console.log('4. Count users...');
    const totalUsers = await prisma.user.count();
    console.log('   Users:', totalUsers);
    
    console.log('5. Count content...');
    const totalContent = await prisma.content.count();
    console.log('   Content:', totalContent);
    
    console.log('6. Aggregate views...');
    const totalViews = await prisma.content.aggregate({
      _sum: { viewCount: true }
    });
    console.log('   Views:', totalViews._sum.viewCount);
    
    console.log('7. Active signals...');
    const activeSignals = await prisma.signal.count({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    console.log('   Active signals:', activeSignals);
    
    console.log('8. Recent datasets...');
    const recentDatasets = await prisma.dataset.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });
    console.log('   Recent datasets:', recentDatasets);
    
    console.log('\n✅ All queries work!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
