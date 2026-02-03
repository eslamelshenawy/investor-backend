const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function test() {
  try {
    console.log('Testing with NOT: { category: null }...\n');
    
    const [
      totalDatasets,
      categoriesData,
      totalSignals,
      totalUsers,
      totalContent,
      totalViews,
      activeSignals,
      recentDatasets
    ] = await Promise.all([
      prisma.dataset.count(),
      prisma.dataset.groupBy({
        by: ['category'],
        where: { NOT: { category: null } }
      }),
      prisma.signal.count(),
      prisma.user.count(),
      prisma.content.count(),
      prisma.content.aggregate({ _sum: { viewCount: true } }),
      prisma.signal.count({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      prisma.dataset.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);
    
    console.log('✅ All queries successful!');
    console.log('   Datasets:', totalDatasets);
    console.log('   Categories:', categoriesData.length);
    console.log('   Signals:', totalSignals);
    console.log('   Users:', totalUsers);
    console.log('   Content:', totalContent);
    console.log('   Views:', totalViews._sum.viewCount || 0);
    console.log('   Active Signals:', activeSignals);
    console.log('   Recent Datasets:', recentDatasets);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
