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

async function resolveUserFromRequest(request: NextRequest): Promise<{ userId: string; email: string } | null> {
  if (!supabaseAdmin) return null;
  const u = await getRequestAuthUser(request);
  if (!u?.id) return null;
  return { userId: u.id, email: u.email || "" };
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
    }
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Missing authentication" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("token_refund_requests")
      .select("*")
      .eq("user_id", user.userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: "Cannot fetch refund requests" }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/tokens/refund-requests failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
    }
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Missing authentication" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const productId = String(body?.productId || "").trim();
    const reason = String(body?.reason || "").trim();
    if (!productId) {
      return NextResponse.json({ error: "Lipsește produsul" }, { status: 400 });
    }
    if (reason.length < 8) {
      return NextResponse.json({ error: "Motivul trebuie să aibă cel puțin 8 caractere" }, { status: 400 });
    }

    const { data: unlocked, error: unlockedError } = await supabaseAdmin
      .from("user_unlocked_products")
      .select("product_id")
      .eq("user_id", user.userId)
      .eq("product_id", productId)
      .maybeSingle();

    if (unlockedError || !unlocked) {
      return NextResponse.json({ error: "Produsul nu este în istoricul tău de deblocare" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("token_refund_requests")
      .select("id,status")
      .eq("user_id", user.userId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json(
        { error: "Ai folosit deja cererea de returnare token pentru acest produs. Este permisă o singură dată." },
        { status: 409 }
      );
    }

    const [{ data: profile }, { data: product, error: productError }] = await Promise.all([
      supabaseAdmin
        .from("user_profiles")
        .select("first_name,last_name,email")
        .eq("user_id", user.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("products")
        .select("id,title,slug,sku,images,custom_fields")
        .eq("id", productId)
        .maybeSingle(),
    ]);

    if (productError || !product) {
      return NextResponse.json({ error: "Produsul nu a fost găsit" }, { status: 404 });
    }

    const userEmail = profile?.email || user.email || "";
    const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Utilizator";

    const payload = {
      user_id: user.userId,
      user_email: userEmail || "unknown@gobid.ro",
      user_name: userName,
      product_id: product.id,
      product_code: pickProductCode(product),
      product_title: String(product.title || "Produs fără titlu"),
      product_slug: product.slug || null,
      product_image_url: pickImageUrl(product.images),
      reason,
      status: "pending",
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("token_refund_requests")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) {
      console.error("Create token refund request failed:", insertError);
      return NextResponse.json({ error: "Nu am putut salva cererea" }, { status: 500 });
    }

    return NextResponse.json({ success: true, request: inserted });
  } catch (error) {
    console.error("POST /api/tokens/refund-requests failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

