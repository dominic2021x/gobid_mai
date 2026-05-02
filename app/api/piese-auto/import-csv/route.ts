/**
 * API – Import produse din CSV sau din date extrase din URL (pieseauto.ro)
 * POST /api/piese-auto/import-csv
 * Body: { products: Array<{ title, description?, price?, image?, imageUrls?, specifications?, livrareSiPlata? }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { importPieseAutoProductsForUser } from "@/lib/piese-auto/import-products-core";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseAdmin: ReturnType<typeof createClient> | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products: rawProducts, forceDuplicate: forceDuplicateParam } = body as {
      products?: Array<{
        title: string;
        description?: string;
        price?: number | string;
        image?: string;
        imageUrls?: string[];
        specifications?: Record<string, string>;
        livrareSiPlata?: string;
        externalId?: string | null;
        location?: string | null;
        url?: string;
      }>;
      forceDuplicate?: boolean;
    };
    const forceDuplicate = !!forceDuplicateParam;

    if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: "Lista de produse este obligatorie." },
        { status: 400 }
      );
    }

    let userId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader && supabase) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(token);
      if (!userError && user) userId = user.id;
    }
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Utilizator neautentificat." },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Serviciu indisponibil." },
        { status: 500 }
      );
    }

    const result = await importPieseAutoProductsForUser(supabaseAdmin, userId, rawProducts, {
      forceDuplicate,
    });

    return NextResponse.json({
      success: true,
      createdCount: result.createdCount,
      failedCount: result.failedCount,
      skippedDuplicates: result.skippedDuplicates,
      createdIds: result.createdIds,
      failed: result.failed,
      errorDetail: result.errorDetail,
      message: result.message,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Eroare la import CSV.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
