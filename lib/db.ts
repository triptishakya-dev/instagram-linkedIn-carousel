import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * A single client for the whole process, built on first use.
 *
 * Prisma 7 has no built-in query engine: the client must be constructed with a
 * driver adapter, and `new PrismaClient()` on its own throws. The connection
 * string is read here rather than from the schema's datasource block, which is
 * why `prisma/schema.prisma` declares no `url` — that file only configures the
 * CLI, by way of `prisma.config.ts`.
 *
 * Construction is deferred behind a proxy so that merely importing a module
 * that touches the database does not require DATABASE_URL. Without that, a
 * unit test for a pure function fails just because its file imports this one.
 *
 * Next's dev server re-evaluates modules on every edit, so the globalThis
 * guard is what stops a fresh connection pool being opened per reload until
 * Postgres starts refusing them.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; the Prisma adapter has nothing to connect to.");
  }

  return new PrismaClient({
    adapter: new PrismaPg(connectionString),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function client(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const created = createClient();
  globalForPrisma.prisma = created;
  return created;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = client() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, property) {
    return property in (client() as unknown as object);
  },
});

/** Test seam: drops the cached client so a later call re-reads DATABASE_URL. */
export async function resetPrismaClient() {
  const existing = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  await existing?.$disconnect();
}
