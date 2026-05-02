/**
 * GET – verifică doar dacă există anunțuri noi pe prima pagină de listare.
 * Nu inserează, nu actualizează. Returnează câte anunțuri sunt pe pagină și câte dintre ele nu sunt în baza de date.
 * Header x-check-stream: 1 → răspuns NDJSON cu log live (type: "log" cu message, type: "done" la final).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchHtml, delay } from "@/lib/scraper/http";
import { parseListingPage } from "@/lib/scraper/parseListing";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_LISTING_URL = "https://www.licitatii-insolventa.ro/cauta";
const IDS_CHUNK_SIZE = 150;

async function isAdminUser(user: { id?: string; user_metadata?: unknown; app_metadata?: unknown } | null): Promise<boolean> {
  if (!user?.id || !supabaseAdmin) return false;
  const meta = user as { user_metadata?: { is_admin?: boolean }; app_metadata?: { is_admin?: boolean } };
  if (meta.user_metadata?.is_admin === true || meta.app_metadata?.is_admin === true) return true;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin === true;
}

export async function GET(request: NextRequest) {
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

  const useStream = request.headers.get("x-check-stream") === "1";

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        };
        try {
          send({ type: "log", message: "Se încarcă prima pagină..." });
          const html = await fetchHtml(BASE_LISTING_URL);
          await delay(400);
          send({ type: "log", message: "Se parsează anunțurile..." });
          const cards = parseListingPage(html, BASE_LISTING_URL);
          const externalIds = cards.map((c) => c.externalId).filter(Boolean);
          const totalOnPage = externalIds.length;

          if (totalOnPage === 0) {
            send({
              type: "done",
              success: true,
              totalOnPage: 0,
              existingCount: 0,
              newCount: 0,
              message: "Nu s-au găsit anunțuri pe prima pagină (posibil structură HTML diferită).",
            });
            controller.close();
            return;
          }

          send({ type: "log", message: "Se compară cu baza de date..." });
          const existingIds = new Set<string>();
          for (let i = 0; i < externalIds.length; i += IDS_CHUNK_SIZE) {
            const chunk = externalIds.slice(i, i + IDS_CHUNK_SIZE);
            const { data: rows } = await db
              .from("licitatii_insolventa_listings")
              .select("source_external_id")
              .in("source_external_id", chunk);
            (rows || []).forEach((r: { source_external_id: string }) => existingIds.add(r.source_external_id));
          }

          const newCount = externalIds.filter((id) => !existingIds.has(id)).length;
          const existingCount = existingIds.size;
          const message =
            newCount > 0
              ? `Pe prima pagină: ${totalOnPage} anunțuri, ${newCount} noi (nu sunt în baza de date). Apasă butonul de mai jos pentru a le adăuga.`
              : `Pe prima pagină: ${totalOnPage} anunțuri, toate sunt deja în baza de date.`;

          send({ type: "done", success: true, totalOnPage, existingCount, newCount, message });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          send({ type: "done", success: false, error: msg, message: `Eroare la verificare: ${msg}` });
        }
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  try {
    const html = await fetchHtml(BASE_LISTING_URL);
    await delay(800);
    const cards = parseListingPage(html, BASE_LISTING_URL);
    const externalIds = cards.map((c) => c.externalId).filter(Boolean);
    const totalOnPage = externalIds.length;

    if (totalOnPage === 0) {
      return NextResponse.json({
        success: true,
        totalOnPage: 0,
        existingCount: 0,
        newCount: 0,
        message: "Nu s-au găsit anunțuri pe prima pagină (posibil structură HTML diferită).",
      });
    }

    const existingIds = new Set<string>();
    for (let i = 0; i < externalIds.length; i += IDS_CHUNK_SIZE) {
      const chunk = externalIds.slice(i, i + IDS_CHUNK_SIZE);
      const { data: rows } = await db
        .from("licitatii_insolventa_listings")
        .select("source_external_id")
        .in("source_external_id", chunk);
      (rows || []).forEach((r: { source_external_id: string }) => existingIds.add(r.source_external_id));
    }

    const newCount = externalIds.filter((id) => !existingIds.has(id)).length;
    const existingCount = existingIds.size;

    const message =
      newCount > 0
        ? `Pe prima pagină: ${totalOnPage} anunțuri, ${newCount} noi (nu sunt în baza de date). Apasă butonul de mai jos pentru a le adăuga.`
        : `Pe prima pagină: ${totalOnPage} anunțuri, toate sunt deja în baza de date.`;

    return NextResponse.json({
      success: true,
      totalOnPage,
      existingCount,
      newCount,
      message,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg, message: `Eroare la verificare: ${msg}` }, { status: 500 });
  }
}
