/**
 * POST – actualizează prețurile la fel ca „Sincronizează titlurile”: fetch de pe licitatii-insolventa.ro
 * pentru fiecare anunț (selectat sau fără preț / toate), fără legătură cu anunțurile publicate pe site.
 * Body: { ids?: string[], onlyMissing?: boolean } – ids: doar acele anunțuri; onlyMissing: doar cele fără preț; altfel toate active (max 3000).
 * Actualizează întotdeauna listing-ul (price_text); dacă anunțul e și listat pe site (product_id), actualizează și produsul.
 * Header x-prices-stream: 1 → NDJSON cu log live (type: "log", type: "done").
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { parseLicitatiiPrice, formatPriceTextForDisplay, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { fetchHtml, delay } from "@/lib/scraper/http";
import { parseDetailPage } from "@/lib/scraper/parseDetail";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 300;

const RON_EUR_RATE = 5;
const DELAY_MS = 500;
const MAX_LISTINGS = 3000;
const IDS_CHUNK_SIZE = 150;

type ItemResult = {
  index: number;
  id: string;
  product_id: string | null;
  source_external_id: string;
  success: boolean;
  error?: string;
  price_text_display?: string;
};

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: { user } } = await supabaseAdmin!.auth.getUser(authHeader.slice(7));
    if (!(await isAdminUser(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const db = supabaseAdmin;

  let ids: string[] | undefined;
  let onlyMissing = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      ids = body.ids.slice(0, MAX_LISTINGS);
    }
    onlyMissing = body?.onlyMissing === true;
  } catch {
    // keep defaults
  }

  type Row = { id: string; product_id: string | null; price_text: string | null; source_external_id: string; source_url: string | null };
  let toProcess: Row[];

  if (ids && ids.length > 0) {
    const allListings: Row[] = [];
    for (let o = 0; o < ids.length; o += IDS_CHUNK_SIZE) {
      const chunk = ids.slice(o, o + IDS_CHUNK_SIZE);
      const { data: listings, error: listError } = await db
        .from("licitatii_insolventa_listings")
        .select("id, product_id, price_text, source_external_id, source_url")
        .in("id", chunk)
        .not("source_url", "is", null);

      if (listError) {
        return NextResponse.json({ error: `Listare anunțuri: ${listError.message}` }, { status: 500 });
      }
      allListings.push(...((listings || []) as Row[]));
    }
    toProcess = allListings;
  } else {
    const PAGE_SIZE = 1000;
    const allRows: Row[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore && allRows.length < MAX_LISTINGS) {
      let query = db
        .from("licitatii_insolventa_listings")
        .select("id, product_id, price_text, source_external_id, source_url")
        .is("deleted_at", null)
        .not("source_url", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (onlyMissing) {
        query = query.or("price_text.is.null,price_text.eq.");
      }
      const { data: page, error: listError } = await query;

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }
      const rows = (page || []) as Row[];
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) hasMore = false;
      else offset += PAGE_SIZE;
    }
    toProcess = allRows.slice(0, MAX_LISTINGS);
  }

  if (toProcess.length === 0) {
    return NextResponse.json({
      success: true,
      total: 0,
      updated: 0,
      failed: 0,
      results: [],
      message: ids?.length ? "Niciun anunț valid pentru ID-urile selectate." : onlyMissing ? "Niciun anunț fără preț." : "Niciun anunț de procesat.",
    });
  }

  const useStream = request.headers.get("x-prices-stream") === "1";

  const runUpdate = async (send: (obj: object) => void) => {
    const results: ItemResult[] = [];
    let updated = 0;
    const total = toProcess.length;

    for (let i = 0; i < toProcess.length; i++) {
      const listing = toProcess[i];
      const index = i + 1;
      let priceText: string | null = listing.price_text;
      try {
        if (listing.source_url) {
          const html = await fetchHtml(listing.source_url);
          await delay(DELAY_MS);
          const detail = parseDetailPage(html, listing.source_url);
          if (detail.priceText != null && String(detail.priceText).trim()) {
            priceText = detail.priceText.trim();
            await db
              .from("licitatii_insolventa_listings")
              .update({ price_text: priceText, updated_at: new Date().toISOString() })
              .eq("id", listing.id);
          }
        }
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        results.push({
          index,
          id: listing.id,
          product_id: listing.product_id,
          source_external_id: listing.source_external_id,
          success: false,
          error: `Fetch sursă: ${msg}`,
        });
        send({
          type: "log",
          index,
          total,
          id: listing.id,
          product_id: listing.product_id ?? undefined,
          source_external_id: listing.source_external_id,
          success: false,
          error: `Fetch sursă: ${msg}`,
          price_text_display: undefined,
          updated,
          failed: index - updated,
        });
        continue;
      }

      const formattedPriceText = formatPriceTextForDisplayEuropean(priceText);
        const priceDisplay = formattedPriceText !== "—" ? formattedPriceText : (priceText || "");

        if (listing.product_id) {
        try {
          const { value: priceValue, currency: priceCurrency } = parseLicitatiiPrice(priceText);
          const startingPriceRON = priceCurrency === "EUR" ? (priceValue > 0 ? priceValue * RON_EUR_RATE : 0) : priceValue;
          const startingPriceEUR = priceCurrency === "EUR" ? priceValue : (priceValue > 0 ? priceValue / RON_EUR_RATE : 0);

          const { data: currentProduct } = await db
            .from("products")
            .select("custom_fields")
            .eq("id", listing.product_id)
            .maybeSingle();

          const baseCustomFields = (currentProduct?.custom_fields && typeof currentProduct.custom_fields === "object") ? currentProduct.custom_fields : {};
          const custom_fields = {
            ...baseCustomFields,
            price_text: formattedPriceText !== "—" ? formattedPriceText : (priceText ?? (baseCustomFields as any)?.price_text),
          };

          const { error: updateError } = await db
            .from("products")
            .update({
              starting_price: startingPriceRON,
              starting_price_ron: startingPriceRON,
              starting_price_eur: Math.round(startingPriceEUR * 100) / 100,
              currency: priceCurrency === "EUR" ? "EUR" : "RON",
              custom_fields,
              updated_at: new Date().toISOString(),
            })
            .eq("id", listing.product_id);

          if (updateError) {
            results.push({
              index,
              id: listing.id,
              product_id: listing.product_id,
              source_external_id: listing.source_external_id,
              success: false,
              error: updateError.message,
            });
            send({
              type: "log",
              index,
              total,
              id: listing.id,
              product_id: listing.product_id,
              source_external_id: listing.source_external_id,
              success: false,
              error: updateError.message,
              price_text_display: undefined,
              updated,
              failed: index - updated,
            });
          } else {
            results.push({
              index,
              id: listing.id,
              product_id: listing.product_id,
              source_external_id: listing.source_external_id,
              success: true,
              price_text_display: priceDisplay,
            });
            updated++;
            send({
              type: "log",
              index,
              total,
              id: listing.id,
              product_id: listing.product_id,
              source_external_id: listing.source_external_id,
              success: true,
              price_text_display: priceDisplay,
              updated,
              failed: index - updated,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({
            index,
            id: listing.id,
            product_id: listing.product_id,
            source_external_id: listing.source_external_id,
            success: false,
            error: msg,
          });
          send({
            type: "log",
            index,
            total,
            id: listing.id,
            product_id: listing.product_id,
            source_external_id: listing.source_external_id,
            success: false,
            error: msg,
            updated,
            failed: index - updated,
          });
        }
      } else {
        results.push({
          index,
          id: listing.id,
          product_id: null,
          source_external_id: listing.source_external_id,
          success: true,
          price_text_display: priceDisplay,
        });
        updated++;
        send({
          type: "log",
          index,
          total,
          id: listing.id,
          product_id: undefined,
          source_external_id: listing.source_external_id,
          success: true,
          price_text_display: priceDisplay,
          updated,
          failed: index - updated,
        });
      }
    }

    const failed = total - updated;
    send({ type: "done", success: true, total, updated, failed, results });
  };

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        await runUpdate(send);
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  let collected: ItemResult[] = [];
  let updatedCount = 0;
  const total = toProcess.length;
  const noopSend = (obj: object) => {
    const o = obj as { type?: string; results?: ItemResult[]; success?: boolean; updated?: number; failed?: number };
    if (o.type === "log" && (o as any).success === true) updatedCount++;
    if (o.type === "done" && Array.isArray(o.results)) collected = o.results;
  };
  await runUpdate(noopSend);

  const failed = total - updatedCount;
  const hint = " La fel ca la Sincronizează titlurile: fără legătură cu anunțurile publicate pe site.";
  return NextResponse.json({
    success: true,
    total,
    updated: updatedCount,
    failed,
    results: collected,
    message: `Procesate ${total}: ${updatedCount} prețuri actualizate, ${failed} eșecuri.${hint}`,
  });
}
