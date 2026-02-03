/**
 * Delete old/test datasets that don't have UUID format IDs
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log('═'.repeat(50));
  console.log('🗑️ حذف الـ datasets القديمة/التجريبية');
  console.log('═'.repeat(50));

  // Count old datasets (without UUID format - no hyphen in ID)
  const oldCount = await prisma.dataset.count({
    where: {
      id: { not: { contains: '-' } }
    }
  });
  console.log(`\n📊 عدد الـ datasets القديمة (بدون UUID): ${oldCount}`);

  if (oldCount === 0) {
    console.log('✅ لا توجد بيانات قديمة للحذف');
    return;
  }

  // Show sample of what will be deleted
  const sample = await prisma.dataset.findMany({
    where: { id: { not: { contains: '-' } } },
    take: 5,
    select: { id: true, name: true, nameAr: true }
  });
  console.log('\n📝 عينة من البيانات التي سيتم حذفها:');
  sample.forEach(d => console.log(`   - ${d.id}: ${d.nameAr || d.name}`));

  // Delete them
  console.log('\n🗑️ جاري الحذف...');
  const deleted = await prisma.dataset.deleteMany({
    where: { id: { not: { contains: '-' } } }
  });
  console.log(`✅ تم حذف: ${deleted.count} dataset`);

  // New total
  const newTotal = await prisma.dataset.count();
  console.log(`\n📊 العدد الجديد الكلي: ${newTotal}`);

  console.log('═'.repeat(50));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
