const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function deletePlaceholders() {
  console.log('=== حذف الـ placeholders الحقيقية (بدون metadata) ===\n');
  
  // Find real placeholders (pattern: مجموعة بيانات + 8 hex chars only)
  const placeholders = await prisma.$queryRaw`
    SELECT id, name_ar, external_id
    FROM datasets 
    WHERE name_ar ~ '^مجموعة بيانات [a-f0-9]{8}$'
    AND (metadata IS NULL OR metadata = 'null'::jsonb)
  `;
  
  console.log('Found', placeholders.length, 'placeholders to delete');
  
  if (placeholders.length > 0) {
    const ids = placeholders.map(p => p.id);
    
    // Delete them
    const result = await prisma.dataset.deleteMany({
      where: { id: { in: ids } }
    });
    
    console.log('✅ Deleted', result.count, 'placeholder datasets');
  }
  
  // Verify
  const remaining = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM datasets 
    WHERE name_ar ~ '^مجموعة بيانات [a-f0-9]{8}$'
  `;
  console.log('Remaining placeholders:', remaining[0].count);
  
  await prisma.$disconnect();
}
deletePlaceholders();
