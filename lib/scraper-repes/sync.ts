/**
 * Sync orchestration for REPES (prod.executori.ro/repes) - server-only.
 * Crawls /repes, upserts repes_listings, soft-deletes missing, fetches details.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { syncRepesProductStatusForListings } from "@/lib/repes-sync-products";
import { formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { launchRepesBrowser, fetchRepesListingPageWithPage, fetchRepesHtml, fetchRepesHtmlWithBrowser, delay } from "./http";
import { parseRepesListingPage, getRepesLastPage } from "./parseListing";
import { parseRepesDetailPage } from "./parseDetail";
import type { RepesListingCard } from "./types";
import type { SyncSummary, VerifyStatusSummary } from "./types";
import pLimit from "p-limit";

const BASE_LISTING_URL = "https://prod.executori.ro/repes";
const DELAY_BETWEEN_PAGES_MS = 5000;
const DELAY_BETWEEN_DETAIL_MS = 800;
const DETAIL_CONCURRENCY = 2;
const DETAIL_REFRESH_HOURS = 24;
const MAX_PAGES_PER_RUN = 200;

/** REPES folosește ?pageIdx=0, ?pageIdx=1, ?pageIdx=2 ... (0-based). */
function buildListingPageUrl(page: number): string {
  if (page <= 1) return `${BASE_LISTING_URL}?pageIdx=0`;
  return `${BASE_LISTING_URL}?pageIdx=${page - 1}`;
}

export type RepesSyncProgress = Partial<SyncSummary> & { phase?: string; message?: string };
export type RepesVerifyStatusProgress = Partial<VerifyStatusSummary> & { phase?: string; message?: string };

function normalizeLocation(raw: string | null): { raw: string; city: string | null; county: string | null } {
  if (!raw || !raw.trim()) return { raw: raw || "", city: null, county: null };
  const r = raw.trim();
  const judetMatch = r.match(/\b(jud\.?|judet(ul)?)\s*[:\s]*([A-Za-zăâîșțĂÂÎȘȚ\-]+)/i);
  const county = judetMatch ? judetMatch[3].trim() : null;
  const city = r.split(",")[0]?.trim() || null;
  return { raw: r, city, county };
}

export async function syncRepesAllListings(options?: { onProgress?: (p: RepesSyncProgress) => void }): Promise<SyncSummary> {
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
    // Același flux ca „Verifică anunțuri noi”: un singur browser, fetchRepesListingPageWithPage (delay-uri lungi), pageIdx.
    report("crawl", "Pornire browser, se parcurg paginile REPES...");
    let launched: Awaited<ReturnType<typeof launchRepesBrowser>> | null = null;
    const allCards = new Map<string, RepesListingCard>();
    let lastPage = 112;

    try {
      launched = await launchRepesBrowser();
      const listingPage = launched.page;
      report("crawl", "Browser pornit. Încep parcurgerea paginilor REPES.");

      for (let page = 1; page <= MAX_PAGES_PER_RUN; page++) {
        if (page > lastPage) break;
        try {
          report("crawl", `Pagina ${page}/${lastPage}...`);
          const pageUrl = buildListingPageUrl(page);
          const html = await fetchRepesListingPageWithPage(listingPage, pageUrl, { timeoutMs: 35000 });
          if (page === 1) {
            const rawLastPage = getRepesLastPage(html);
            lastPage = Math.min(rawLastPage, MAX_PAGES_PER_RUN);
            if (rawLastPage > MAX_PAGES_PER_RUN) {
              summary.errors.push(`Limită: primele ${MAX_PAGES_PER_RUN} pagini din ${rawLastPage}.`);
            }
          }
          summary.pagesCrawled = page;
          const cards = parseRepesListingPage(html, pageUrl);
          if (cards.length === 0 && page === 1) {
            summary.errors.push("Nu s-au găsit anunțuri pe prima pagină REPES.");
            break;
          }
          const beforeCount = allCards.size;
          cards.forEach((c) => allCards.set(c.externalId, c));
          summary.itemsFound = allCards.size;
          const newOnThisPage = allCards.size - beforeCount;
          if (newOnThisPage === 0 && cards.length > 0) {
            report("crawl", `Pagina ${page}/${lastPage} | ${cards.length} carduri dar 0 noi (conținut duplicat – SPA n-a încărcat pagina ${page}?) | Total cumulat: ${summary.itemsFound}`);
          } else {
            report("crawl", `Pagina ${page}/${lastPage} | Carduri: ${cards.length} | Noi pe pagină: ${newOnThisPage} | Total cumulat: ${summary.itemsFound}`);
          }
          if (page >= lastPage) break;
          await delay(DELAY_BETWEEN_PAGES_MS);
        } catch (e) {
          summary.errors.push(`Pagina ${page}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      if (launched) await launched.browser.close();
    }

    report("crawl", `Crawl terminat. Total ${summary.itemsFound} anunțuri din ${summary.pagesCrawled} pagini.`);

    const listingRows = Array.from(allCards.values()).map((card) => {
      const loc = card.locationRaw ? normalizeLocation(card.locationRaw) : { raw: "", city: null, county: null };
      const formattedPrice = card.priceText ? formatPriceTextForDisplayEuropean(card.priceText) : null;
      return {
        source_external_id: card.externalId,
        source_url: card.detailUrl,
        title: card.title || null,
        price_text: formattedPrice && formattedPrice !== "—" ? formattedPrice : null,
        location_raw: card.locationRaw || null,
        location_city: loc.city,
        location_county: loc.county,
        last_seen_at: crawlStartedAt,
        deleted_at: null,
      };
    });

    report("upsert", `Pregătit ${listingRows.length} înregistrări. Actualizare baza de date REPES...`);
    for (const row of listingRows) {
      try {
        const { data: existing } = await db
          .from("repes_listings")
          .select("id, updated_at")
          .eq("source_external_id", row.source_external_id)
          .single();

        if (existing) {
          await db
            .from("repes_listings")
            .update({
              source_url: row.source_url,
              title: row.title,
              price_text: row.price_text,
              location_raw: row.location_raw,
              location_city: row.location_city,
              location_county: row.location_county,
              last_seen_at: row.last_seen_at,
              deleted_at: null,
            })
            .eq("source_external_id", row.source_external_id);
          summary.updated++;
        } else {
          await db.from("repes_listings").insert(row);
          summary.inserted++;
        }
      } catch (e) {
        summary.errors.push(`Upsert ${row.source_external_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    report("upsert", `Baza de date: ${summary.inserted} noi, ${summary.updated} actualizate`);

    const { data: toSoftDelete } = await db
      .from("repes_listings")
      .select("id, source_external_id")
      .lt("last_seen_at", crawlStartedAt)
      .is("deleted_at", null);

    if (toSoftDelete?.length) {
      const ids = toSoftDelete.map((r: { id: string }) => r.id);
      await db.from("repes_listings").update({ deleted_at: crawlStartedAt }).in("id", ids);
      summary.softDeleted = toSoftDelete.length;
      await syncRepesProductStatusForListings(ids, true);
    }
    report("upsert", `Dezactivate: ${summary.softDeleted}`);

    const { data: allListingsRaw } = await db
      .from("repes_listings")
      .select("id, source_external_id, source_url, updated_at, pdf_url, description_html")
      .is("deleted_at", null);

    const allListings = (allListingsRaw ?? []) as { id: string; source_external_id: string; source_url: string; updated_at: string; pdf_url: string | null; description_html: string | null }[];
    const cutoff = new Date(Date.now() - DETAIL_REFRESH_HOURS * 60 * 60 * 1000).toISOString();
    const needsDetail = allListings.filter(
      (l) =>
        l.pdf_url == null ||
        (l.description_html == null || l.description_html === "") ||
        l.updated_at < cutoff
    );

    report("details", `Descărcare detalii pentru ${needsDetail.length} anunțuri...`);
    const limit = pLimit(DETAIL_CONCURRENCY);
    const detailTasks = needsDetail.map((listing) =>
      limit(async () => {
        try {
          const html = await fetchRepesHtml(listing.source_url);
          await delay(DELAY_BETWEEN_DETAIL_MS);
          const detail = parseRepesDetailPage(html, listing.source_url);

          const auctionDate = detail.auctionDate && detail.auctionTime
            ? `${detail.auctionDate}T${detail.auctionTime}:00`
            : detail.auctionDate;

          const formattedDetailPrice = detail.priceText ? formatPriceTextForDisplayEuropean(detail.priceText) : null;
          await db
            .from("repes_listings")
            .update({
              title: detail.title,
              price_text: formattedDetailPrice && formattedDetailPrice !== "—" ? formattedDetailPrice : detail.priceText,
              location_raw: detail.locationRaw,
              description_html: detail.descriptionHtml,
              seller_name: detail.sellerName,
              seller_email: detail.sellerEmail,
              seller_phone: detail.sellerPhone,
              seller_address: detail.sellerAddress,
              pdf_url: detail.pdfUrl,
              pdf_urls: detail.pdfUrls?.length ? detail.pdfUrls : null,
              auction_date: auctionDate || null,
              auction_time: detail.auctionTime,
              meta_fields: detail.metaFields && Object.keys(detail.metaFields).length ? detail.metaFields : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", listing.id);

          const { data: existingImages } = await db.from("repes_listing_images").select("id").eq("listing_id", listing.id);
          if (existingImages?.length) {
            await db.from("repes_listing_images").delete().eq("listing_id", listing.id);
          }
          if (detail.imageUrls.length) {
            const imageRows = detail.imageUrls.map((url, i) => ({
              listing_id: listing.id,
              url,
              sort_order: i,
            }));
            await db.from("repes_listing_images").insert(imageRows);
          }
          summary.detailsFetched++;
          if (summary.detailsFetched % 10 === 0) {
            report("details", `Detalii: ${summary.detailsFetched}/${needsDetail.length}`);
          }
        } catch (e) {
          summary.errors.push(`Detail ${listing.source_external_id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );
    await Promise.all(detailTasks);
    report("done", "Sincronizare REPES finalizată.");
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  return summary;
}

/**
 * Verifică doar starea anunțurilor REPES: parcurge paginile, compară cu DB, actualizează deleted_at.
 * Dacă listingIds este furnizat, actualizează starea doar pentru acele anunțuri.
 */
export async function verifyRepesStatusOnly(options?: {
  onProgress?: (p: RepesVerifyStatusProgress) => void;
  /** Dacă este setat, verifică starea doar pentru aceste listing IDs. */
  listingIds?: string[];
}): Promise<VerifyStatusSummary> {
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
    result.errors.push("Supabase admin client not configured");
    return result;
  }

  const nowIso = new Date().toISOString();
  const limitToIds = options?.listingIds?.length ? new Set(options.listingIds) : null;

  try {
    // REPES e SPA (Angular): listarea se renderează la client. Folosim browser ca să vedem anunțurile reale și să nu marcam greșit anunțuri ca Dezactivat.
    report("crawl", limitToIds ? "Se încarcă paginile REPES (doar pentru anunțurile selectate)..." : "Se încarcă prima pagină REPES...");
    let firstHtml: string;
    let useBrowser = false;
    try {
      firstHtml = await fetchRepesHtmlWithBrowser(buildListingPageUrl(1), { timeoutMs: 35000 });
      useBrowser = true;
    } catch {
      firstHtml = await fetchRepesHtml(buildListingPageUrl(1));
      result.errors.push("Verificare stare folosește fetch simplu (Puppeteer indisponibil/timeout). Pe site-uri SPA anunțurile pot apărea greșit ca Dezactivat. Pentru rezultate corecte: npm install puppeteer.");
    }
    await delay(DELAY_BETWEEN_PAGES_MS);

    const lastPage = Math.min(getRepesLastPage(firstHtml), MAX_PAGES_PER_RUN);
    const allCards = new Map<string, RepesListingCard>();
    parseRepesListingPage(firstHtml, BASE_LISTING_URL).forEach((c) => allCards.set(c.externalId, c));
    result.pagesCrawled = 1;
    result.itemsFound = allCards.size;

    for (let page = 2; page <= lastPage; page++) {
      try {
        const html = useBrowser
          ? await fetchRepesHtmlWithBrowser(buildListingPageUrl(page), { timeoutMs: 35000 })
          : await fetchRepesHtml(buildListingPageUrl(page));
        result.pagesCrawled++;
        parseRepesListingPage(html, BASE_LISTING_URL).forEach((c) => allCards.set(c.externalId, c));
        result.itemsFound = allCards.size;
        await delay(DELAY_BETWEEN_PAGES_MS);
      } catch {
        break;
      }
    }

    const crawledExternalIds = new Set(allCards.keys());

    let activeQuery = db.from("repes_listings").select("id, source_external_id").is("deleted_at", null);
    if (limitToIds) activeQuery = activeQuery.in("id", Array.from(limitToIds));
    const { data: activeRows } = await activeQuery;
    const toSoftDeleteIds = (activeRows ?? [])
      .filter((r: { source_external_id: string }) => !crawledExternalIds.has(r.source_external_id))
      .map((r: { id: string }) => r.id);

    if (toSoftDeleteIds.length > 0) {
      await db.from("repes_listings").update({ deleted_at: nowIso, reactivated_at: null }).in("id", toSoftDeleteIds);
      result.softDeleted = toSoftDeleteIds.length;
      await syncRepesProductStatusForListings(toSoftDeleteIds, true);
    }

    let deletedQuery = db.from("repes_listings").select("id, source_external_id").not("deleted_at", "is", null);
    if (limitToIds) deletedQuery = deletedQuery.in("id", Array.from(limitToIds));
    const { data: deletedRows } = await deletedQuery;
    const toReactivateIds = (deletedRows ?? [])
      .filter((r: { source_external_id: string }) => crawledExternalIds.has(r.source_external_id))
      .map((r: { id: string }) => r.id);

    if (toReactivateIds.length > 0) {
      await db.from("repes_listings").update({ deleted_at: null, last_seen_at: nowIso, reactivated_at: nowIso }).in("id", toReactivateIds);
      result.reactivated = toReactivateIds.length;
      await syncRepesProductStatusForListings(toReactivateIds, false);
    }

    report("done", `Dezactivate: ${result.softDeleted}, Reactivate: ${result.reactivated}`);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}
