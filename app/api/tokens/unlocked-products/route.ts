import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


function pickProductCode(product: any): string {
  const customFields = product?.custom_fields && typeof product.custom_fields === "object" ? product.custom_fields : {};
  const candidates = [
    product?.sku,
    customFields?.cod_anunt,
    customFields?.anunt_code,
    customFields?.code,
    customFields?.cod,
    customFields?.listing_id,
    customFields?.id_anunt,
    customFields?.reference,
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  if (found) return String(found).trim();
  return String(product?.id || "").slice(0, 8).toUpperCase() || "N/A";
}

function pickImageUrl(images: any): string | null {
  if (!images) return null;
  if (typeof images === "string" && images.trim().length > 0) return images.trim();
  if (Array.isArray(images)) {
    for (const entry of images) {
      if (typeof entry === "string" && entry.trim().length > 0) return entry.trim();
      if (entry && typeof entry === "object") {
        const maybe = entry.url || entry.src;
        if (typeof maybe === "string" && maybe.trim().length > 0) return maybe.trim();
      }
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
    }

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: "Missing authentication" }, { status: 401 });
    }
    const userId = authUser.id;

    const { data: unlockedRows, error: unlockedError } = await supabaseAdmin
      .from("user_unlocked_products")
      .select("product_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);

    let normalizedUnlockRows: Array<{ product_id: string; created_at: string }> = unlockedRows || [];

    if (unlockedError) {
      console.warn("Could not read user_unlocked_products, trying fallback from transactions:", unlockedError);
      normalizedUnlockRows = [];
    }

    // Mereu completăm cu ID-uri din token_transactions (spent, deblocare), ca să nu lipsească niciun anunț deblocat.
    const { data: txRows } = await supabaseAdmin
      .from("token_transactions")
      .select("description, created_at")
      .eq("user_id", userId)
      .eq("type", "spent")
      .order("created_at", { ascending: false })
      .limit(5000);

    const txSeen = new Set<string>();
    (txRows || []).forEach((tx) => {
      const description = String(tx?.description || "");
      if (!/deblocare produs/i.test(description)) return;
      const markerId = description.match(/\[product_id:([a-f0-9-]{8,})\]/i)?.[1]?.trim();
      if (markerId && !txSeen.has(markerId)) {
        txSeen.add(markerId);
        normalizedUnlockRows.push({ product_id: markerId, created_at: tx.created_at || new Date().toISOString() });
      }
    });

    // Mereu adăugăm și tranzacțiile fără [product_id:] (date vechi sau import) – rezolvăm după titlu ca să apară toate anunțurile din istoric.
    const titlesToResolve: Array<{ title: string; created_at: string }> = [];
    (txRows || []).forEach((tx) => {
      const description = String(tx?.description || "");
      if (!/deblocare produs/i.test(description)) return;
      const markerId = description.match(/\[product_id:([a-f0-9-]{8,})\]/i)?.[1]?.trim();
      if (markerId) return; // deja adăugat mai sus
      const titleFromText = description.match(/deblocare produs:\s*(.+?)(?:\s*\[product_id:|$)/i)?.[1]?.trim();
      if (titleFromText && titleFromText.length >= 4) {
        titlesToResolve.push({ title: titleFromText, created_at: tx.created_at || new Date().toISOString() });
      }
    });

    for (const { title, created_at } of titlesToResolve) {
      const snippet = title.slice(0, 120);
      const { data: titleMatch } = await supabaseAdmin
        .from("products")
        .select("id")
        .ilike("title", `%${snippet}%`)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(1);
      const id = titleMatch?.[0] ? String((titleMatch[0] as { id: string }).id).trim() : "";
      if (id && !txSeen.has(id)) {
        txSeen.add(id);
        normalizedUnlockRows.push({ product_id: id, created_at });
      }
    }

    // Keep one row per product_id (latest unlock timestamp).
    const latestByProductId = new Map<string, string>();
    for (const row of normalizedUnlockRows) {
      const productId = String(row.product_id || "").trim();
      if (!productId) continue;
      const createdAt = String(row.created_at || "");
      const existing = latestByProductId.get(productId);
      if (!existing || createdAt > existing) {
        latestByProductId.set(productId, createdAt);
      }
    }

    const normalizedUniqueRows = Array.from(latestByProductId.entries())
      .map(([product_id, created_at]) => ({ product_id, created_at }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const productIds = normalizedUniqueRows.map((row) => row.product_id).filter(Boolean);
    if (productIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, category, subcategory, location, sku, custom_fields, images")
      .in("id", productIds);

    if (productsError) {
      console.error("Failed to fetch products for unlock history:", productsError);
      return NextResponse.json({ error: "Cannot read product details" }, { status: 500 });
    }

    const productById = new Map((products || []).map((product) => [product.id, product]));

    const result = normalizedUniqueRows.map((row) => {
      const product = productById.get(row.product_id);
      return {
        productId: row.product_id,
        unlockedAt: row.created_at,
        slug: product?.slug || null,
        title: product?.title || "Produs indisponibil",
        productCode: pickProductCode(product),
        imageUrl: pickImageUrl(product?.images),
        category: product?.category || null,
        subcategory: product?.subcategory || null,
        location: product?.location || null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unexpected error fetching unlocked products:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

