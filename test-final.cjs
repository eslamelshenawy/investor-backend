const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function test() {
  try {
    console.log('Testing all stats queries...\n');
    
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
      prisma.dataset.groupBy({ by: ['category'] }),
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
    
    const validCategories = categoriesData.filter(c => c.category !== null);
    
    console.log('✅ Overview Stats:');
    console.log('   Datasets:', totalDatasets);
    console.log('   Categories:', validCategories.length);
    console.log('   Signals:', totalSignals);
    console.log('   Users:', totalUsers);
    console.log('   Content:', totalContent);
    console.log('   Views:', totalViews._sum.viewCount || 0);
    console.log('   Active Signals:', activeSignals);
    console.log('   Recent Datasets:', recentDatasets);
    
    // Test trending
    console.log('\nTesting trending...');
    const categoryStatsRaw = await prisma.dataset.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15
    });
    const categoryStats = categoryStatsRaw.filter(c => c.category !== null).slice(0, 5);
    console.log('   Top categories:', categoryStats.map(c => `${c.category}: ${c._count.id}`));
    
    console.log('\n✅ All queries successful!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
