/**
 * POST /api/licitatii-publice/fill-auction-from-description
 * Completează data, ora și adresa licitației din descriere.
 * Body: { productId: string } sau { slug: string }
 * Actualizează când: lipsește auction_date SAU data existentă este în trecut (indiciu că nu e extrasă corect).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  extractAuctionDateAndTimeFromText,
  combineDateAndTime,
} from "@/lib/extractAuctionFromDescription";
import { extractAuctionDateAndTimeWithAI } from "@/lib/ai/extractAuctionDateWithAI";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const productId = body.productId as string | undefined;
    const slug = body.slug as string | undefined;
    if (!productId && !slug) {
      return NextResponse.json(
        { error: "Lipsește productId sau slug" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin.from("products").select("id, description, auction_date, custom_fields, address");
    if (productId) query = query.eq("id", productId);
    else query = query.eq("slug", slug);
    const { data: product, error: fetchError } = await query.maybeSingle();

    if (fetchError || !product) {
      return NextResponse.json(
        { error: "Produsul nu a fost găsit" },
        { status: 404 }
      );
    }

    const existingDate = product.auction_date && String(product.auction_date).trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingIsPast =
      existingDate && new Date(existingDate).getTime() < today.getTime();
    if (existingDate && !existingIsPast) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "Produsul are deja data licitației (în viitor)",
      });
    }

    const description = product.description && String(product.description).trim();
    if (!description) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "Descriere lipsă",
      });
    }

    let extracted = extractAuctionDateAndTimeFromText(description);
    const regexHasDateOrRolling =
      extracted.dateIso || extracted.rollingDaily || extracted.rollingWeekly;
    const regexHasTime = !!extracted.time;
    if (!regexHasDateOrRolling || !regexHasTime) {
      const aiExtracted = await extractAuctionDateAndTimeWithAI(description);
      if (aiExtracted) {
        const aiHasData =
          aiExtracted.dateIso || aiExtracted.rollingDaily || aiExtracted.rollingWeekly;
        if (!regexHasDateOrRolling && aiHasData) {
          extracted = aiExtracted;
        } else {
          if (!extracted.dateIso && aiExtracted.dateIso) extracted.dateIso = aiExtracted.dateIso;
          if (!extracted.time && aiExtracted.time) extracted.time = aiExtracted.time;
          if (!extracted.dateIso2 && aiExtracted.dateIso2) extracted.dateIso2 = aiExtracted.dateIso2;
          if (!extracted.rollingDaily && aiExtracted.rollingDaily) extracted.rollingDaily = true;
          if (!extracted.rollingWeekly && aiExtracted.rollingWeekly) extracted.rollingWeekly = aiExtracted.rollingWeekly;
          if (!extracted.address && aiExtracted.address) extracted.address = aiExtracted.address;
        }
      }
    }
    const hasDateOrRolling =
      extracted.dateIso || extracted.rollingDaily || extracted.rollingWeekly;
    if (!hasDateOrRolling) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "Nu s-a putut extrage data din descriere (nici regex, nici AI)",
      });
    }

    const customFields =
      product.custom_fields && typeof product.custom_fields === "object"
        ? { ...(product.custom_fields as Record<string, unknown>) }
        : {};

    let auction_date: string;
    if (extracted.rollingDaily) {
      auction_date = "2099-12-31T00:00:00";
      customFields.auction_rolling_daily = true;
      if (extracted.time) customFields.auction_time = extracted.time;
    } else if (extracted.rollingWeekly) {
      auction_date =
        combineDateAndTime(extracted.dateIso, extracted.time) ||
        (extracted.dateIso ?? "") + "T00:00:00";
      customFields.auction_rolling_weekly =
        ["duminica", "luni", "marti", "miercuri", "joi", "vineri", "sambata"][
          extracted.rollingWeekly.weekday
        ];
      if (extracted.time) customFields.auction_time = extracted.time;
      if (extracted.dateIso2) customFields.data_licitatie_2 = extracted.dateIso2;
      if (extracted.time && extracted.dateIso2) customFields.ora_licitatie_2 = extracted.time;
    } else {
      auction_date =
        combineDateAndTime(extracted.dateIso!, extracted.time) ||
        (extracted.dateIso ?? "");
      if (extracted.time) customFields.auction_time = extracted.time;
    }
    if (extracted.address && !customFields.locatie_bunuri)
      customFields.locatie_bunuri = extracted.address;

    const updatePayload: Record<string, unknown> = {
      auction_date,
      custom_fields: customFields,
      updated_at: new Date().toISOString(),
    };
    if (extracted.address && !product.address) updatePayload.address = extracted.address;

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update(updatePayload)
      .eq("id", product.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: true,
      auction_date,
      auction_time: extracted.time ?? undefined,
    });
  } catch (e) {
    console.error("[fill-auction-from-description]", e);
    return NextResponse.json(
      { error: "Eroare la completare" },
      { status: 500 }
    );
  }
}
