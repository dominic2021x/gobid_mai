/**
 * Sync orchestration for licitatii-insolventa.ro (server-only).
 * Crawls /cauta, upserts listings, soft-deletes missing, fetches details with concurrency.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { syncProductStatusForListings } from "@/lib/licitatii-insolventa-sync-products";
import { fetchHtml, delay } from "./http";
import { normalizeLocation } from "./location";
import { parseListingPage, getLastPage, extractExternalId, type ListingCard } from "./parseListing";
import { parseDetailPage } from "./parseDetail";
import { buildDetailUpdatePayload } from "./detailToPayload";
import type { SyncSummary, VerifyStatusSummary } from "./types";
import pLimit from "p-limit";

type ListingForDetail = {
  id: string;
  source_external_id: string;
  source_url: string;
  updated_at: string;
  pdf_url: string | null;
  description_html: string | null;
  category: string | null;
  info_marca: string | null;
  info_km: string | null;
  info_combustibil: string | null;
  info_an_fabricatie: string | null;
  info_capacitate_cilindrica: string | null;
  info_suprafata: string | null;
  info_tip_imobil: string | null;
  info_camere: string | null;
  info_an_constructie: string | null;
};

const BASE_LISTING_URL = "https://www.licitatii-insolventa.ro/cauta";
const DELAY_BETWEEN_PAGES_MS = 1200;
const DELAY_BETWEEN_DETAIL_MS = 1000;
/** 1 = la rând (mai lent dar extrage tot); 3 = paralel (rapid dar site-ul poate să sară peste). */
const DETAIL_CONCURRENCY = 1;
const DETAIL_REFRESH_HOURS = 24;
/** Număr maxim de pagini (evită bucle infinite dacă getLastPage e greșit). */
const MAX_PAGES_PER_RUN = 500;

/** Pagina 1 = /cauta; paginile 2+ = /cauta/iPage,N (conform .paginate a.searchPaginationLast) */
function buildListingPageUrl(page: number): string {
  if (page <= 1) return BASE_LISTING_URL;
  return `${BASE_LISTING_URL}/iPage,${page}`;
}

export type SyncProgress = Partial<SyncSummary> & { phase?: string; message?: string };
export type VerifyStatusProgress = Partial<VerifyStatusSummary> & { phase?: string; message?: string };

export async function syncAllListings(options?: { onProgress?: (p: SyncProgress) => void }): Promise<SyncSummary> {
  const summary: SyncSummary = {
    pagesCrawled: 0,
    itemsFound: 0,
    inserted: 0,
    updated: 0,
    softDeleted: 0,
    detailsFetched: 0,
    errors: [],
  };
  const report = (phase: string, message?: string) => {
    options?.onProgress?.({ ...summary, phase, message });
  };

  const db = supabaseAdmin;
  if (!db) {
    summary.errors.push("Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY)");
    return summary;
  }

  const crawlStartedAt = new Date().toISOString();

  try {
    report("crawl", "Se încarcă prima pagină...");
    const firstPageUrl = buildListingPageUrl(1);
    const firstHtml = await fetchHtml(firstPageUrl);
    await delay(DELAY_BETWEEN_PAGES_MS);

    const rawLastPage = getLastPage(firstHtml);
    const lastPage = Math.min(rawLastPage, MAX_PAGES_PER_RUN);
    if (rawLastPage > MAX_PAGES_PER_RUN) {
      summary.errors.push(`Limită: primele ${MAX_PAGES_PER_RUN} pagini din ${rawLastPage}.`);
    }
    summary.pagesCrawled = 1;

    const allCards = new Map<string, ListingCard>();
    const firstCards = parseListingPage(firstHtml, firstPageUrl);
    if (firstCards.length === 0) {
      summary.errors.push("Nu s-au găsit anunțuri pe prima pagină (posibil structură HTML diferită).");
    }
    firstCards.forEach((c) => allCards.set(c.externalId, c));
    summary.itemsFound = allCards.size;
    report("crawl", `Pagina 1/${lastPage} – ${summary.itemsFound} anunțuri`);

    for (let page = 2; page <= lastPage; page++) {
      try {
        report("crawl", `Pagina ${page}/${lastPage}...`);
        const pageUrl = buildListingPageUrl(page);
        const html = await fetchHtml(pageUrl);
        summary.pagesCrawled++;
        const cards = parseListingPage(html, pageUrl);
        cards.forEach((c) => allCards.set(c.externalId, c));
        summary.itemsFound = allCards.size;
        report("crawl", `Pagina ${summary.pagesCrawled}/${lastPage} – ${summary.itemsFound} anunțuri`);
        await delay(DELAY_BETWEEN_PAGES_MS);
      } catch (e) {
        summary.errors.push(`Page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    summary.itemsFound = allCards.size;

    const listingRows = Array.from(allCards.values()).map((card) => {
      const loc = card.locationRaw ? normalizeLocation(card.locationRaw) : { raw: "", city: null, county: null };
      return {
        source_external_id: card.externalId,
        source_url: card.detailUrl,
        title: card.title || null,
        price_text: card.priceText || null,
        category: card.category || null,
        location_raw: card.locationRaw || null,
        location_city: loc.city,
        location_county: loc.county,
        last_seen_at: crawlStartedAt,
        deleted_at: null,
      };
    });

    report("upsert", "Actualizare baza de date...");
    let upserted = 0;
    for (const row of listingRows) {
      try {
        const { data: existing } = await db
          .from("licitatii_insolventa_listings")
          .select("id, updated_at, pdf_url, description_html")
          .eq("source_external_id", row.source_external_id)
          .single();

        if (existing) {
          await db
            .from("licitatii_insolventa_listings")
            .update({
              source_url: row.source_url,
              title: row.title,
              price_text: row.price_text,
              category: row.category,
              location_raw: row.location_raw,
              location_city: row.location_city,
              location_county: row.location_county,
              last_seen_at: row.last_seen_at,
              deleted_at: null,
            })
            .eq("source_external_id", row.source_external_id);
          summary.updated++;
        } else {
          await db.from("licitatii_insolventa_listings").insert({
            ...row,
            id: undefined,
          });
          summary.inserted++;
        }
        upserted++;
        if (upserted % 50 === 0) report("upsert", `Actualizat ${upserted}/${listingRows.length}...`);
      } catch (e) {
        summary.errors.push(`Upsert ${row.source_external_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    report("upsert", `Baza de date actualizată: ${summary.inserted} noi, ${summary.updated} actualizate`);

    const { data: toSoftDelete } = await db
      .from("licitatii_insolventa_listings")
      .select("id, source_external_id")
      .lt("last_seen_at", crawlStartedAt)
      .is("deleted_at", null);

    if (toSoftDelete?.length) {
      const ids = toSoftDelete.map((r) => r.id);
      await db
        .from("licitatii_insolventa_listings")
        .update({ deleted_at: crawlStartedAt })
        .in("id", ids);
      summary.softDeleted = toSoftDelete.length;
      await syncProductStatusForListings(ids, true);
    }
    report("upsert", `Dezactivate: ${summary.softDeleted}`);

    const { data: allListingsRaw } = await db
      .from("licitatii_insolventa_listings")
      .select(
        "id, source_external_id, source_url, updated_at, pdf_url, description_html, category, " +
          "info_marca, info_km, info_combustibil, info_an_fabricatie, info_capacitate_cilindrica, " +
          "info_suprafata, info_tip_imobil, info_camere, info_an_constructie"
      )
      .is("deleted_at", null);

    const allListings = ((allListingsRaw ?? []) as unknown) as ListingForDetail[];

    const cutoff = new Date(Date.now() - DETAIL_REFRESH_HOURS * 60 * 60 * 1000).toISOString();
    const isAutoCategory = (c: string | null) =>
      c != null && /^(Autoturisme|Camioane|Vehicule\s+Utilitare|Vehicule\s+Transport\s+Persoane)$/i.test(c.trim());
    const isImobiliareCategory = (c: string | null) =>
      c != null &&
      /^(Apartamente\s*si\s*case|Cladiri|Terenuri|Teren\s+cu\s+cladire|Proiecte\s*imobiliare|Proprietati\s*industriale|Spatii\s*de\s*birouri|Spatii\s*comerciale|Pensiuni|Hoteluri)$/i.test(c.trim());
    const empty = (v: string | null | undefined) => v == null || String(v).trim() === "";
    const anyAutoFieldMissing = (l: ListingForDetail) =>
      empty(l.info_marca) || empty(l.info_km) || empty(l.info_combustibil) || empty(l.info_an_fabricatie) || empty(l.info_capacitate_cilindrica);
    const anyImobiliareFieldMissing = (l: ListingForDetail) =>
      empty(l.info_suprafata) || empty(l.info_tip_imobil) || empty(l.info_camere) || empty(l.info_an_constructie);

    const needsDetail = allListings.filter(
        (l) =>
          l.pdf_url == null ||
          (l.description_html == null || l.description_html === "") ||
          l.updated_at < cutoff ||
          (isAutoCategory(l.category) && anyAutoFieldMissing(l)) ||
          (isImobiliareCategory(l.category) && anyImobiliareFieldMissing(l))
    );

    report("details", `Descărcare detalii pentru ${needsDetail.length} anunțuri...`);
    const limit = pLimit(DETAIL_CONCURRENCY);
    const detailTasks = needsDetail.map((listing) =>
      limit(async () => {
        try {
          const html = await fetchHtml(listing.source_url);
          await delay(DELAY_BETWEEN_DETAIL_MS);
          const detail = parseDetailPage(html, listing.source_url);
          const { update, imageUrls } = buildDetailUpdatePayload(detail);

          await db
            .from("licitatii_insolventa_listings")
            .update({ ...update, updated_at: new Date().toISOString() })
            .eq("id", listing.id);

          const { data: existingImages } = await db
            .from("licitatii_insolventa_listing_images")
            .select("id")
            .eq("listing_id", listing.id);

          if (existingImages?.length) {
            await db
              .from("licitatii_insolventa_listing_images")
              .delete()
              .eq("listing_id", listing.id);
          }
          const imageRows = imageUrls.map((url, i) => ({
            listing_id: listing.id,
            url,
            sort_order: i,
          }));
          if (imageRows.length) {
            await db.from("licitatii_insolventa_listing_images").insert(imageRows);
          }
          summary.detailsFetched++;
          if (summary.detailsFetched % 10 === 0) {
            report("details", `Detalii descărcate: ${summary.detailsFetched}/${needsDetail.length}`);
          }
        } catch (e) {
          summary.errors.push(
            `Detail ${listing.source_external_id}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      })
    );
    await Promise.all(detailTasks);
    report("done", "Sincronizare finalizată.");
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  return summary;
}

/**
 * Verifică doar starea anunțurilor existente: parcurge toate paginile de listare,
 * compară cu DB și actualizează doar deleted_at (dezactivează pe cele care nu mai apar, reactivează pe cele care apar din nou).
 * Nu inserează anunțuri noi și nu actualizează titlu/preț/detalii.
 */
export async function verifyStatusOnly(options?: { onProgress?: (p: VerifyStatusProgress) => void }): Promise<VerifyStatusSummary> {
  const result: VerifyStatusSummary = {
    pagesCrawled: 0,
    itemsFound: 0,
    softDeleted: 0,
    reactivated: 0,
    errors: [],
  };
  const report = (phase: string, message?: string) => {
    options?.onProgress?.({ ...result, phase, message });
  };

  const db = supabaseAdmin;
  if (!db) {
    result.errors.push("Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY)");
    return result;
  }

  const nowIso = new Date().toISOString();

  try {
    report("crawl", "Se încarcă prima pagină...");
    const firstPageUrl = buildListingPageUrl(1);
    const firstHtml = await fetchHtml(firstPageUrl);
    await delay(DELAY_BETWEEN_PAGES_MS);

    const rawLastPage = getLastPage(firstHtml);
    const lastPage = Math.min(rawLastPage, MAX_PAGES_PER_RUN);
    if (rawLastPage > MAX_PAGES_PER_RUN) {
      result.errors.push(`Limită: primele ${MAX_PAGES_PER_RUN} pagini din ${rawLastPage}.`);
    }
    result.pagesCrawled = 1;

    const allCards = new Map<string, ListingCard>();
    const firstCards = parseListingPage(firstHtml, firstPageUrl);
    if (firstCards.length === 0) {
      result.errors.push("Nu s-au găsit anunțuri pe prima pagină (posibil structură HTML diferită).");
    }
    firstCards.forEach((c) => allCards.set(c.externalId, c));
    result.itemsFound = allCards.size;
    report("crawl", `Pagina 1/${lastPage} – ${result.itemsFound} anunțuri`);

    for (let page = 2; page <= lastPage; page++) {
      try {
        report("crawl", `Pagina ${page}/${lastPage}...`);
        const pageUrl = buildListingPageUrl(page);
        const html = await fetchHtml(pageUrl);
        result.pagesCrawled++;
        const cards = parseListingPage(html, pageUrl);
        cards.forEach((c) => allCards.set(c.externalId, c));
        result.itemsFound = allCards.size;
        report("crawl", `Pagina ${result.pagesCrawled}/${lastPage} – ${result.itemsFound} anunțuri`);
        await delay(DELAY_BETWEEN_PAGES_MS);
      } catch (e) {
        result.errors.push(`Page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const crawledExternalIds = new Set(allCards.keys());
    report("upsert", "Se verifică starea în baza de date...");

    const { data: activeRows } = await db
      .from("licitatii_insolventa_listings")
      .select("id, source_external_id")
      .is("deleted_at", null);

    const toSoftDeleteIds = (activeRows ?? [])
      .filter((r: { source_external_id: string }) => !crawledExternalIds.has(r.source_external_id))
      .map((r: { id: string }) => r.id);

    let useReactivatedAt = true;

    if (toSoftDeleteIds.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < toSoftDeleteIds.length; i += BATCH) {
        const batch = toSoftDeleteIds.slice(i, i + BATCH);
        const payload = useReactivatedAt ? { deleted_at: nowIso, reactivated_at: null } : { deleted_at: nowIso };
        const { error: updErr } = await db.from("licitatii_insolventa_listings").update(payload).in("id", batch);
        if (updErr && (String(updErr.message || "").includes("reactivated_at") || String(updErr.message || "").includes("does not exist"))) {
          useReactivatedAt = false;
          await db.from("licitatii_insolventa_listings").update({ deleted_at: nowIso }).in("id", batch);
        }
      }
      result.softDeleted = toSoftDeleteIds.length;
      await syncProductStatusForListings(toSoftDeleteIds, true);
    }

    const { data: deletedRows } = await db
      .from("licitatii_insolventa_listings")
      .select("id, source_external_id")
      .not("deleted_at", "is", null);

    const toReactivateIds = (deletedRows ?? []).filter((r: { source_external_id: string }) =>
      crawledExternalIds.has(r.source_external_id)
    ).map((r: { id: string }) => r.id);

    if (toReactivateIds.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < toReactivateIds.length; i += BATCH) {
        const batch = toReactivateIds.slice(i, i + BATCH);
        const payload = useReactivatedAt ? { deleted_at: null, last_seen_at: nowIso, reactivated_at: nowIso } : { deleted_at: null, last_seen_at: nowIso };
        const { error: updErr } = await db.from("licitatii_insolventa_listings").update(payload).in("id", batch);
        if (updErr && (String(updErr.message || "").includes("reactivated_at") || String(updErr.message || "").includes("does not exist"))) {
          useReactivatedAt = false;
          await db.from("licitatii_insolventa_listings").update({ deleted_at: null, last_seen_at: nowIso }).in("id", batch);
        }
      }
      result.reactivated = toReactivateIds.length;
      await syncProductStatusForListings(toReactivateIds, false);
    }

    report("upsert", `Dezactivate: ${result.softDeleted}, Reactivate: ${result.reactivated}`);
    report("done", "Verificare stare finalizată.");
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}
