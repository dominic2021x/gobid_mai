/**
 * Prisma Client singleton — **lazy**: the client is created on first use, not at import time.
 * Listings and counts use Supabase/PostgREST by default; Prisma is only for opt-in paths
 * (e.g. `USE_PRISMA_LISTINGS=true`, admin tools).
 * When first used, requires DIRECT_URL or DATABASE_URL.
 */
import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DIRECT_URL or DATABASE_URL is required for Prisma. Set one in .env.local, or use Supabase-only flows and keep Prisma code paths disabled.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrismaInstance(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Proxied client — no DB connection until a query runs. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaInstance(), prop, receiver);
  },
}) as PrismaClient;
