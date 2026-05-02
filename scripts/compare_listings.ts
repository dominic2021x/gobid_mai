/**
 * Output parity check: Supabase vs Prisma for RO listings.
 * Run: npx tsx scripts/compare_listings.ts
 * Requires: .env.local with Supabase vars + DATABASE_URL for Prisma.
 * Dev only - does not affect production.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config(); // fallback to .env

import {
  getRoListingsSupabase,
  getRoListingsPrisma,
  type RoListingsResult,
} from "../lib/server/products/listingsRepo";

const QUERIES = [
  { name: "no filters", query: { from: 0, limit: 10 } },
  { name: "with offset", query: { from: 5, limit: 10 } },
  { name: "small limit", query: { from: 0, limit: 5 } },
  { name: "page 2", query: { from: 20, limit: 10 } },
  { name: "limit 30", query: { from: 0, limit: 30 } },
];

function ids(items: RoListingsResult["items"]): string[] {
  return items.map((i) => (i as { id?: string }).id ?? "?").filter(Boolean);
}

async function main() {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasPrisma = !!process.env.DATABASE_URL;

  if (!hasSupabase) {
    console.error("Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local");
    process.exit(1);
  }
  if (!hasPrisma) {
    console.error("Missing DATABASE_URL. Add it to .env.local (e.g. from Supabase Dashboard → Database → Connection string) to compare Prisma.");
    process.exit(1);
  }

  console.log("Comparing Supabase vs Prisma listings...\n");

  let allOk = true;
  for (const { name, query } of QUERIES) {
    const [supa, prisma] = await Promise.all([
      getRoListingsSupabase(query),
      getRoListingsPrisma(query),
    ]);

    const supaIds = ids(supa.items);
    const prismaIds = ids(prisma.items);
    const totalMatch = supa.items.length === prisma.items.length;
    const idsMatch = supaIds.slice(0, 5).every((id, i) => id === prismaIds[i]);
    const nextFromMatch = supa.nextFrom === prisma.nextFrom;
    const hasMoreMatch = supa.hasMore === prisma.hasMore;

    const ok = totalMatch && idsMatch && nextFromMatch && hasMoreMatch;
    if (!ok) allOk = false;

    const status = ok ? "✓" : "✗";
    console.log(`${status} ${name} (from=${query.from}, limit=${query.limit})`);
    console.log(`   Supabase: total=${supa.items.length}, nextFrom=${supa.nextFrom}, hasMore=${supa.hasMore}, ids[0..4]=${supaIds.slice(0, 5).join(",")}`);
    console.log(`   Prisma:  total=${prisma.items.length}, nextFrom=${prisma.nextFrom}, hasMore=${prisma.hasMore}, ids[0..4]=${prismaIds.slice(0, 5).join(",")}`);
    if (!ok) {
      if (!totalMatch) console.log(`   DIFF: total mismatch`);
      if (!idsMatch) console.log(`   DIFF: first 5 ids differ`);
      if (!nextFromMatch) console.log(`   DIFF: nextFrom mismatch`);
      if (!hasMoreMatch) console.log(`   DIFF: hasMore mismatch`);
    }
    console.log("");
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
