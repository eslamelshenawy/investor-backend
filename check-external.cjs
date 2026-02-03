const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});
async function main() {
  const withExternalUUID = await prisma.dataset.count({ 
    where: { isActive: true, externalId: { contains: '-' } } 
  });
  const mapsWithExternalUUID = await prisma.dataset.count({ 
    where: { category: 'المساحة والخرائط', isActive: true, externalId: { contains: '-' } } 
  });
  
  console.log('After fix (using externalId filter):');
  console.log('  Total datasets:', withExternalUUID);
  console.log('  المساحة والخرائط:', mapsWithExternalUUID);
  await prisma.$disconnect();
}
main();
