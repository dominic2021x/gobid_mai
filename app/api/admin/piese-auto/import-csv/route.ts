/**
 * POST /api/admin/piese-auto/import-csv
 * Multipart: file (.csv), targetUserId (uuid), opțional forceDuplicate=true
 * Importă produsele în contul utilizatorului țintă ca status activ (live).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { importPieseAutoProductsForUser } from "@/lib/piese-auto/import-products-core";
import { parsePieseAutoCsvToProducts } from "@/lib/piese-auto/parse-piese-auto-csv";
import {
  ADMIN_IMPORT_ROWS_NORMAL,
  ADMIN_IMPORT_ROWS_TURBO,
} from "@/lib/piese-auto/admin-import-limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 8 * 1024 * 1024;

function isMultipartFilePart(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Cerere multipart invalidă." }, { status: 400 });
  }

  const targetUserIdRaw = formData.get("targetUserId");
  const targetUserId =
    typeof targetUserIdRaw === "string" ? targetUserIdRaw.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId este obligatoriu." }, { status: 400 });
  }

  const forceDup =
    formData.get("forceDuplicate") === "true" || formData.get("forceDuplicate") === "on";
  const turbo =
    formData.get("turbo") === "true" || formData.get("turbo") === "on";
  const fastImport =
    turbo ||
    formData.get("fastImport") === "true" ||
    formData.get("fastImport") === "on";

  const file = formData.get("file");
  if (!file || typeof file === "string" || !isMultipartFilePart(file)) {
    return NextResponse.json({ error: "Lipsește fișierul CSV." }, { status: 400 });
  }

  const size = file.size;
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fișierul trebuie să aibă între 1 și ${MAX_BYTES / (1024 * 1024)} MB.` },
      { status: 400 }
    );
  }

  const { data: ures, error: uerr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (uerr || !ures?.user) {
    return NextResponse.json({ error: "Utilizatorul țintă nu a fost găsit." }, { status: 404 });
  }

  const u = ures.user;
  const metaType =
    typeof u.user_metadata?.account_type === "string" ? u.user_metadata.account_type : null;

  const { data: prof } = await supabaseAdmin
    .from("user_profiles")
    .select("account_type, piese_auto_csv_import_approved")
    .eq("user_id", targetUserId)
    .maybeSingle();

  const profRow = prof as {
    account_type?: string | null;
    piese_auto_csv_import_approved?: boolean | null;
  } | null;

  const isPieseAuto =
    metaType === "piese_auto" || profRow?.account_type === "piese_auto";
  if (!isPieseAuto) {
    return NextResponse.json(
      { error: "Contul țintă nu este dealer piese auto." },
      { status: 400 }
    );
  }

  if (profRow?.piese_auto_csv_import_approved !== true) {
    return NextResponse.json(
      {
        error:
          "Importul CSV pentru acest cont nu este aprobat. Marchează „validat de support” în panoul Piese auto înainte de import.",
      },
      { status: 403 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const csvText = buf.toString("utf-8");
  const products = parsePieseAutoCsvToProducts(csvText);

  if (products.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nu s-au putut citi rânduri din CSV. Verifică header-ul (ex.: titlu, url, pret) și că fișierul nu e gol.",
      },
      { status: 400 }
    );
  }

  const maxRows = turbo ? ADMIN_IMPORT_ROWS_TURBO : ADMIN_IMPORT_ROWS_NORMAL;
  if (products.length > maxRows) {
    return NextResponse.json(
      {
        error:
          `Acest endpoint importă cel mult ${maxRows} rânduri într-o singură cerere. ` +
          "Pentru fișiere mari folosește „Pregătește coada live” + „Start / Reia”, ca importul să ruleze în loturi controlate fără să suprasolicite baza de date.",
      },
      { status: 413 }
    );
  }

  try {
    const result = await importPieseAutoProductsForUser(supabaseAdmin, targetUserId, products, {
      forceDuplicate: forceDup,
      fastImport,
      turbo,
    });

    return NextResponse.json({
      success: true,
      targetUserId,
      rowCount: products.length,
      createdCount: result.createdCount,
      failedCount: result.failedCount,
      skippedDuplicates: result.skippedDuplicates,
      createdIds: result.createdIds,
      failed: result.failed,
      errorDetail: result.errorDetail,
      message: result.message,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Eroare la import.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
