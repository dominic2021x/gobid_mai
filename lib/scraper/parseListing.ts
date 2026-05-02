/**
 * Parse listing HTML from licitatii-insolventa.ro/cauta (server-only).
 */

import * as cheerio from "cheerio";

const BASE_URL = "https://www.licitatii-insolventa.ro";

export interface ListingCard {
  externalId: string;
  detailUrl: string;
  title: string;
  priceText: string | null;
  category: string | null;
  locationRaw: string | null;
  thumbnails: string[];
}

/**
 * Extract external id from URL suffix _i172250, /anunt/.../123, ?id=123, or text "ID anunt #172250".
 */
export function extractExternalId(detailUrl: string, cardText?: string): string {
  const fromUrl = detailUrl.match(/_i(\d+)(?:\?|$|#|\/)/);
  if (fromUrl) return fromUrl[1];
  const anuntSlug = detailUrl.match(/\/anunt\/[^/]*?[-_](\d+)(?:\?|$|#)/);
  if (anuntSlug) return anuntSlug[1];
  const idParam = detailUrl.match(/[?&]id=(\d+)/);
  if (idParam) return idParam[1];
  if (cardText) {
    const fromText = cardText.match(/ID\s*anunt\s*#?\s*(\d+)/i);
    if (fromText) return fromText[1];
  }
  const fallback = detailUrl.match(/(\d{4,})(?:\?|$|#|\/)/);
  return fallback ? fallback[1] : "";
}

/**
 * Get last page number from listing HTML.
 * Reads .paginate a.searchPaginationLast and extracts iPage,N from href (path /cauta/iPage,40 sau query ?iPage,39).
 */
export function getLastPage(html: string): number {
  const $ = cheerio.load(html);
  const lastLink = $(".paginate a.searchPaginationLast").attr("href");
  if (!lastLink) return 1;
  const match = lastLink.match(/iPage,(\d+)/);
  if (match) return Math.max(1, parseInt(match[1], 10));
  return 1;
}

/** Extract category name from detail URL path (e.g. /imobiliare/terenuri/... -> Terenuri, /altele/altele_1/... -> Altele). */
function categoryFromDetailUrl(detailUrl: string): string | null {
  try {
    const path = new URL(detailUrl).pathname;
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const lastSegment = segments[segments.length - 1];
    const idMatch = lastSegment.match(/_i(\d+)$/);
    const beforeSlug = idMatch ? segments[segments.length - 2] : segments[segments.length - 1];
    if (!beforeSlug) return null;
    const name = beforeSlug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return name.length > 0 && name.length < 80 ? name : null;
  } catch {
    return null;
  }
}

/** Match location pattern "City in County (Romania)" or "Romania" in text. */
function matchLocationInText(text: string): string | null {
  const m = text.match(/([^\n*]+)\s+in\s+([^\n(]+)\s+\(Romania\)/);
  if (m) return `${m[1].trim()} in ${m[2].trim()} (Romania)`;
  if (/\bRomania\b/i.test(text) && text.length < 150) return "Romania";
  return null;
}

/**
 * Parse listing HTML from /cauta and return array of listing cards.
 * Card structure: link to detail, .middle .loc for location, title, price, category, thumbnails.
 */
export function parseListingPage(html: string, pageUrl: string): ListingCard[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;
  const cards: ListingCard[] = [];

  // Selectori pentru carduri (licitatii-insolventa.ro /cauta: .list-prod cu .middle .loc pentru locație)
  const cardSelector =
    ".list-prod, .searchResults .item, .listing-item, .search-result-item, .annonce-item, article.listing, .result-item, .item .middle, .annonce, [class*='listing']";
  let items = $(cardSelector);
  if (items.length === 0) items = $("a[href*='/anunt/']");
  if (items.length === 0) items = $("a[href*='_i']");
  if (items.length === 0) items = $("a[href*='anunt']");
  if (items.length === 0) items = $(".item");

  const processedUrls = new Set<string>();

  items.each((_, el) => {
    const $el = $(el);
    const $card = $el.hasClass("item") || $el.hasClass("list-prod") || $el.find(".middle").length ? $el : $el.closest(".list-prod, .item, .listing-item, .search-result-item, .annonce-item, [class*='result']").length ? $el.closest(".list-prod, .item, .listing-item, .search-result-item, .annonce-item, [class*='result']") : $el.parent();
    const $root = $card.length ? $card : $el;

    let link =
      $el.is("a") ? $el.attr("href") : $el.find("a[href*='/anunt/'], a[href*='_i']").first().attr("href");
    if (!link) return;
    const detailUrl = link.startsWith("http") ? link : new URL(link, base).href;
    if (processedUrls.has(detailUrl)) return;
    processedUrls.add(detailUrl);

    const externalId = extractExternalId(detailUrl, $root.text());
    if (!externalId) return;

    const titleEl =
      $root.find(".title, .titlu, .annonce-title, h2, h3").first() ||
      $root.find(".middle h3, .middle .title").first();
    const title = titleEl.length
      ? titleEl.text().replace(/\s+/g, " ").trim()
      : ($el.is("a") ? $el.text() : $root.text()).replace(/\s+/g, " ").trim().slice(0, 200);

    const priceEl = $root.find(".price, .pret, .right .price, .middle .price").first();
    const priceText = priceEl.length
      ? priceEl.text().replace(/\s+/g, " ").trim() || null
      : null;

    let locationRaw: string | null = null;
    const locEl = $root.find(".middle .loc, .location, .locatie, .loc").first();
    if (locEl.length) locationRaw = locEl.text().replace(/\s+/g, " ").trim() || null;
    // Pagina /cauta: .loc conține "Oraș in Județ (Romania)" – textul rămâne după icon
    if (!locationRaw) locationRaw = matchLocationInText($root.text());

    let category: string | null = null;
    const catEl = $root.find(".category, .categorie, .right .category, .middle .category").first();
    if (catEl.length) category = catEl.text().replace(/\s+/g, " ").trim() || null;
    if (!category) {
      $root.find("a[href*='/imobiliare/'], a[href*='/altele/'], a[href*='/auto/'], a[href*='/afaceri/'], a[href*='/industrial/'], a[href*='/office/']").each((_, a) => {
        const href = $(a).attr("href") ?? "";
        if (href.includes("/anunt/") || href.includes("_i")) return;
        const t = $(a).text().replace(/\s+/g, " ").trim();
        if (t && t.length > 0 && t.length < 80) {
          category = t;
          return false;
        }
      });
    }
    if (!category) category = categoryFromDetailUrl(detailUrl);

    const thumbnails: string[] = [];
    $root.find("img").each((__, img) => {
      const src = $(img).attr("src");
      if (src) {
        const full = src.startsWith("http") ? src : new URL(src, base).href;
        thumbnails.push(full);
      }
    });

    cards.push({
      externalId,
      detailUrl,
      title: title || "",
      priceText,
      category,
      locationRaw,
      thumbnails,
    });
  });

  // Fallback: orice link care arată ca pagină detaliu (_i123 sau /anunt/...)
  if (cards.length === 0) {
    $("a[href*='_i'], a[href*='/anunt/'], a[href*='anunt']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const detailUrl = href.startsWith("http") ? href : new URL(href, base).href;
      if (processedUrls.has(detailUrl)) return;
      const externalId = extractExternalId(detailUrl, $(el).text());
      if (!externalId) return;
      processedUrls.add(detailUrl);
      const $parent = $(el).closest(".list-prod, .item, .listing-item, [class*='result']").length
        ? $(el).closest(".list-prod, .item, .listing-item, [class*='result']")
        : $(el).parent();
      const blockText = $parent.length ? $parent.text() : $(el).text();
      cards.push({
        externalId,
        detailUrl,
        title: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) || "Anunț",
        priceText: null,
        category: categoryFromDetailUrl(detailUrl),
        locationRaw: matchLocationInText(blockText),
        thumbnails: [],
      });
    });
  }

  return cards;
}
