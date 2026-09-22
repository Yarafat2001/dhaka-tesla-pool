import { PrismaClient } from '@prisma/client';

// A single shared PrismaClient instance per process, per Prisma's own
// best-practice guidance - avoids exhausting the DB connection pool by
// creating a new client per request.
export const prisma = new PrismaClient();
