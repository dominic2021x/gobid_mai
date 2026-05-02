/**
 * Optional direct `pg` pool for hot listing paths (bypasses PostgREST per-request overhead).
 * Set `LISTINGS_HOT_DATABASE_URL` (or `DIRECT_DATABASE_URL`) to a Postgres connection string with
 * the same privileges as the service role used for listings.
 *
 * Not wired by default — use from new code paths when you want raw `pool.query(...)`.
 */

import pg from "pg";

let pool: pg.Pool | null = null;

export function getListingsHotPool(): pg.Pool | null {
  const connectionString = process.env.LISTINGS_HOT_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!connectionString) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: Math.min(10, Number(process.env.LISTINGS_HOT_POOL_MAX ?? "5") || 5),
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function closeListingsHotPool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end().catch(() => {});
}
