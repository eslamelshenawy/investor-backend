const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function explore() {
  console.log('=== أعمدة جدول datasets ===\n');
  
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'datasets'
    ORDER BY ordinal_position
  `;
  
  columns.forEach(c => console.log('-', c.column_name, '(', c.data_type, ')'));
  
  // Check if there's metadata column
  const hasMetadata = columns.find(c => c.column_name === 'metadata');
  console.log('\n=== هل يوجد عمود metadata؟', hasMetadata ? 'نعم ✅' : 'لا ❌');
  
  // Get a sample dataset with all fields
  console.log('\n=== عينة من dataset ===');
  const sample = await prisma.dataset.findFirst({
    where: { nameAr: { not: { startsWith: 'مجموعة بيانات' } } }
  });
  
  if (sample) {
    console.log('id:', sample.id);
    console.log('name:', sample.name);
    console.log('nameAr:', sample.nameAr);
    console.log('category:', sample.category);
    console.log('source:', sample.source);
    console.log('columns:', sample.columns ? sample.columns.substring(0, 100) : 'null');
    console.log('resources:', sample.resources ? String(sample.resources).substring(0, 100) : 'null');
    console.log('dataPreview:', sample.dataPreview ? sample.dataPreview.substring(0, 100) : 'null');
  }
  
  await prisma.$disconnect();
}
explore();
