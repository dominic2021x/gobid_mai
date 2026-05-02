/**
 * Backfill listing_geo from products.county and products.city / product_location.
 * Match county → geo_counties, city/locality → geo_places (exact then alias).
 * geo_quality: exact (city exact), inferred (alias or low confidence), county_only.
 *
 * Run: npx tsx scripts/geo/backfillListingGeo.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocation } from "@/lib/search/geo/normalizeLocation";

const BATCH_SIZE = 200;
const MAX_PRODUCTS = 100_000;

type ProductRow = { id: string; county: string | null; city: string | null; product_location: string | null };
type CountyRow = { id: string; code: string; name_norm: string };
type PlaceRow = { id: string; county_id: string; name_norm: string };
type AliasRow = { place_id: string; alias_norm: string };

async function main() {
  const supabase = createAdminClient();

  const countiesRes = await supabase.from("geo_counties").select("id, code, name_norm");
  const counties = (countiesRes.data ?? []) as CountyRow[];
  const countyByCode = new Map<string, string>();
  const countyByNameNorm = new Map<string, string>();
  for (const c of counties) {
    countyByCode.set(c.code.toLowerCase(), c.id);
    countyByNameNorm.set(c.name_norm, c.id);
  }

  const placesRes = await supabase.from("geo_places").select("id, county_id, name_norm");
  const places = (placesRes.data ?? []) as PlaceRow[];
  const placeByCountyAndNorm = new Map<string, PlaceRow>();
  for (const p of places) {
    placeByCountyAndNorm.set(`${p.county_id}|${p.name_norm}`, p);
  }

  const aliasesRes = await supabase.from("geo_place_aliases").select("place_id, alias_norm");
  const aliases = (aliasesRes.data ?? []) as AliasRow[];
  const placeByAliasNorm = new Map<string, string>();
  for (const a of aliases) {
    placeByAliasNorm.set(a.alias_norm, a.place_id);
  }

  let offset = 0;
  let written = 0;
  let skipped = 0;

  while (offset < MAX_PRODUCTS) {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, county, city, product_location")
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Products fetch error:", error.message);
      break;
    }
    const rows = (products ?? []) as ProductRow[];
    if (rows.length === 0) break;

    for (const p of rows) {
      const countyRaw = (p.county ?? p.product_location ?? "").toString().trim();
      const cityRaw = (p.city ?? p.product_location ?? "").toString().trim();
      const countyNorm = countyRaw ? normalizeLocation(countyRaw) : "";
      const cityNorm = cityRaw ? normalizeLocation(cityRaw) : "";

      let countyId: string | null = null;
      if (countyNorm) {
        if (countyNorm.length === 2) countyId = countyByCode.get(countyNorm) ?? null;
        if (!countyId) countyId = countyByNameNorm.get(countyNorm) ?? null;
      }

      let placeId: string | null = null;
      let geoQuality: "exact" | "inferred" | "county_only" = "county_only";

      if (countyId && cityNorm && cityNorm.length >= 2) {
        const exactKey = `${countyId}|${cityNorm}`;
        const place = placeByCountyAndNorm.get(exactKey);
        if (place) {
          placeId = place.id;
          geoQuality = "exact";
        } else {
          const aliasPlaceId = placeByAliasNorm.get(cityNorm);
          if (aliasPlaceId) {
            const placeRow = places.find((pl) => pl.id === aliasPlaceId);
            if (placeRow && placeRow.county_id === countyId) {
              placeId = aliasPlaceId;
              geoQuality = "inferred";
            }
          }
        }
      }

      if (!countyId && !placeId) {
        skipped++;
        continue;
      }

      const payload = {
        listing_id: p.id,
        county_id: countyId,
        place_id: placeId,
        parent_place_id: null,
        lat: null,
        lng: null,
        geo_quality: geoQuality,
        source: "product_fields",
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from("listing_geo")
        .upsert(payload, { onConflict: "listing_id", ignoreDuplicates: false });

      if (!upsertErr) written++;
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
    if (offset % 2000 === 0) console.log("Processed", offset, "products…");
  }

  console.log("Backfill done. Written:", written, "Skipped (no match):", skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
