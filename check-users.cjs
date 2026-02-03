const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true }
  });
  console.log('Users in database:');
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

main();
