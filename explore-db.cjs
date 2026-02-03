const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function explore() {
  console.log('=== استكشاف قاعدة البيانات ===\n');
  
  // 1. List all tables
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  console.log('1. الجداول الموجودة:');
  tables.forEach(t => console.log('   -', t.table_name));
  
  // 2. Check if OfficialDashboard table exists
  const dashboardTable = tables.find(t => t.table_name.toLowerCase().includes('dashboard'));
  if (dashboardTable) {
    console.log('\n2. وجدت جدول dashboard:', dashboardTable.table_name);
    
    // Get columns
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ${dashboardTable.table_name}
    `;
    console.log('   الأعمدة:');
    columns.forEach(c => console.log('     -', c.column_name, '(', c.data_type, ')'));
  }
  
  // 3. Check Dashboard model in Prisma
  try {
    const dashboardCount = await prisma.dashboard.count();
    console.log('\n3. جدول Dashboard (user dashboards):', dashboardCount, 'records');
  } catch (e) {
    console.log('\n3. جدول Dashboard غير موجود في Prisma');
  }
  
  // 4. Check OfficialDashboard if exists
  try {
    const officialCount = await prisma.officialDashboard.count();
    console.log('\n4. جدول OfficialDashboard:', officialCount, 'records');
    
    // Sample
    const sample = await prisma.officialDashboard.findFirst();
    if (sample) {
      console.log('   Sample:', JSON.stringify(sample, null, 2).substring(0, 500));
    }
  } catch (e) {
    console.log('\n4. جدول OfficialDashboard غير موجود:', e.message.substring(0, 100));
  }
  
  await prisma.$disconnect();
}
explore();
