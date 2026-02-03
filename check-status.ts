import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
});

async function check() {
  const withMeta: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM datasets WHERE metadata IS NOT NULL`;
  const withoutMeta: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM datasets WHERE metadata IS NULL AND is_active = true`;
  console.log('With metadata:', withMeta[0].count);
  console.log('Without metadata (active):', withoutMeta[0].count);
  await prisma.$disconnect();
}
check();
