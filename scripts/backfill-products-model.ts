/**
 * One-off backfill: populate products.model (and optionally brand) from custom_fields.
 * Idempotent – safe to run multiple times.
 *
 * Run: npx tsx scripts/backfill-products-model.ts
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config();

import { createClient } from "@supabase/supabase-js";

const BATCH = 200;

function trim(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  let totalUpdated = 0;
  let totalBrandFilled = 0;
  let offset = 0;
  let hasMore = true;

  console.log("Backfill products.model (and brand where missing) from custom_fields...\n");

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, model, brand, custom_fields")
      .is("model", null)
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("Supabase error:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of rows as { id: string; model: string | null; brand: string | null; custom_fields: Record<string, unknown> | null }[]) {
      const cf = row.custom_fields && typeof row.custom_fields === "object" ? row.custom_fields : {};
      const cfModel = trim(cf.model ?? cf.model_name);
      const cfBrand = trim(cf.brand ?? cf.marca);
      const needModel = cfModel && (!row.model || !row.model.trim());
      const needBrand = cfBrand && (!row.brand || !row.brand.trim());

      if (!needModel && !needBrand) continue;

      const updates: { model?: string; brand?: string } = {};
      if (needModel) updates.model = cfModel ?? undefined;
      if (needBrand) updates.brand = cfBrand ?? undefined;

      const { error: upErr } = await supabase.from("products").update(updates).eq("id", row.id);
      if (upErr) {
        console.warn(`Update failed for ${row.id}:`, upErr.message);
        continue;
      }
      if (needModel) totalUpdated++;
      if (needBrand) totalBrandFilled++;
    }

    offset += rows.length;
    hasMore = rows.length === BATCH;
    if (rows.length > 0) process.stdout.write(`\rProcessed ${offset} rows, updated model: ${totalUpdated}, brand: ${totalBrandFilled}`);
  }

  console.log(`\nDone. Total model backfilled: ${totalUpdated}. Total brand filled: ${totalBrandFilled}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
