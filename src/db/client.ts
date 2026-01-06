import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export { prisma };

export async function initDb(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
}
