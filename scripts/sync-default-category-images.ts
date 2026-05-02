import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { getCategoryDefaultImageUrl, isPlaceholderImage } from "../lib/getProductDisplayImage";

loadEnvConfig(process.cwd());

function isGoogleMapsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  return (u.includes("google") && u.includes("maps")) || u.includes("goo.gl/maps");
}

function isCategoryDefaultImage(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("/images/category-defaults/");
}

function hasRealProductImage(row: any): boolean {
  const urls: string[] = [];
  const images = Array.isArray(row?.images) ? row.images : [];
  for (const item of images) {
    if (typeof item === "string") urls.push(item);
    else if (item && typeof item === "object" && typeof (item as any).url === "string") urls.push((item as any).url);
  }
  return urls.some((url) => {
    const s = String(url || "").trim();
    if (!s) return false;
    if (isGoogleMapsUrl(s)) return false;
    if (isPlaceholderImage(s)) return false;
    if (isCategoryDefaultImage(s)) return false;
    return true;
  });
}

function normalizeText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function isLicitatiiPubliceProduct(row: any): boolean {
  const productType = normalizeText(String(row?.product_type || ""));
  const saleType = normalizeText(String(row?.sale_type || ""));
  return productType === "licitatii-publice" || saleType === "licitatie-publica" || saleType === "licitatii-insolventa";
}

function getExpectedDefaultImage(row: any): string {
  const customFields = row?.custom_fields && typeof row.custom_fields === "object" ? row.custom_fields : {};
  const listingCategory = String((customFields as any).listing_category || "").trim();

  if (isLicitatiiPubliceProduct(row)) {
    // LP: imaginea trebuie să urmeze subcategoria fină (teren, apartamente, camioane etc.).
    return getCategoryDefaultImageUrl(null, listingCategory || row?.subcategory);
  }

  return getCategoryDefaultImageUrl(row?.category, row?.subcategory);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pageSize = 1000;
  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let kept = 0;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, category, subcategory, images, product_type, sale_type, custom_fields")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Fetch failed at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;

    page += 1;
    scanned += data.length;

    for (const row of data) {
      if (hasRealProductImage(row)) {
        kept += 1;
        continue;
      }

      const expected = getExpectedDefaultImage(row);
      const currentUrls: string[] = Array.isArray(row.images)
        ? row.images
            .map((item: any) => (typeof item === "string" ? item : (item && typeof item === "object" ? item.url : "")))
            .filter((u: string) => typeof u === "string" && u.trim().length > 0)
        : [];
      const current = currentUrls[0] ? String(currentUrls[0]).trim() : "";

      if (current === expected) {
        kept += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update({ images: [expected] })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Update failed for id=${row.id}: ${updateError.message}`);
      }

      updated += 1;
    }

    console.log(`page=${page} scanned=${scanned} updated=${updated} kept=${kept}`);

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log("done", { scanned, updated, kept });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
