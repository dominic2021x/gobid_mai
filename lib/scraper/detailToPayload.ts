/**
 * Build DB update payload from parsed detail page.
 * Used by sync and by the admin refresh-detail API (no server-only deps here).
 */

import type { DetailParsed } from "./parseDetail";
import { normalizeLocation } from "./location";
import { getMainCategoryFromSource } from "@/lib/data/licitatii-insolventa-category-map";
import { extractAuctionDateAndTimeFromText } from "@/lib/extractAuctionFromDescription";

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseAuctionDate(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  const trimmed = s.replace(/\s+/g, " ").trim();
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = parseInt(d!, 10);
  const month = parseInt(mo!, 10) - 1;
  const year = parseInt(y!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Keys by group for partial refresh in admin. */
export const DETAIL_UPDATE_GROUPS = {
  description: ["description_html"],
  auto: ["info_marca", "info_km", "info_combustibil", "info_an_fabricatie", "info_capacitate_cilindrica"],
  imobiliare: ["info_suprafata", "info_tip_imobil", "info_camere", "info_an_constructie"],
  pdf: ["pdf_url", "pdf_urls"],
  seller: ["seller_name", "seller_profile_url", "seller_email", "seller_phone", "seller_address"],
  all: [] as string[],
} as const;

export type DetailUpdateGroup = keyof typeof DETAIL_UPDATE_GROUPS;

/**
 * Build the DB update payload and image URLs from a parsed detail page.
 */
/** Ziua publicării (00:00:00) pentru comparație – dacă data licitației e înainte de ea, e invalidă. */
function publicationDayStart(publishedAt: Date | null): Date | null {
  if (!publishedAt || isNaN(publishedAt.getTime())) return null;
  const d = new Date(publishedAt);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Verifică dacă avem completate câmpurile data și ora licitației (principal sau „2”). */
function hasStoredDateAndTime(detail: DetailParsed): boolean {
  const hasDate = !!(detail.customFields.dataLicitatie?.trim() || detail.customFields.dataLicitatie2?.trim());
  const hasTime = !!(detail.customFields.oraLicitatie?.trim() || detail.customFields.oraLicitatie2?.trim());
  return hasDate && hasTime;
}

export function buildDetailUpdatePayload(detail: DetailParsed): {
  update: Record<string, unknown>;
  imageUrls: string[];
} {
  let auctionDate = parseAuctionDate(detail.customFields.dataLicitatie) ?? parseAuctionDate(detail.customFields.dataLicitatie2);
  let auctionTime = detail.customFields.oraLicitatie ?? detail.customFields.oraLicitatie2 ?? null;
  let locationRaw = detail.locationRaw ?? undefined;
  const descHtml = detail.descriptionHtml ?? "";
  const pubDay = publicationDayStart(detail.publishedAt);

  // Obligatoriu extragem din descriere dacă: lipsesc data/ora licitație (sau „2”) SAU data este mai veche decât ziua publicării/regenerării.
  // Afișarea datei licitației e esențială – fără ea anunțul nu e considerat activ.
  const mustExtractFromDescription =
    !auctionDate ||
    !hasStoredDateAndTime(detail) ||
    (pubDay !== null && new Date(auctionDate).setHours(0, 0, 0, 0) < pubDay.getTime());

  let rollingDaily = false;
  let rollingWeeklyWeekday: number | null = null; // 0=duminică .. 6=sâmbătă
  let dataLicitatie2: string | undefined;
  let oraLicitatie2: string | undefined;
  if (mustExtractFromDescription && descHtml) {
    const extracted = extractAuctionDateAndTimeFromText(descHtml);
    if (extracted.rollingDaily) {
      rollingDaily = true;
      auctionDate = "2099-12-31"; // ceas 24h, reset la miezul nopții
      auctionTime = "24:00";
      if (extracted.address) locationRaw = extracted.address;
    } else if (extracted.rollingWeekly?.weekday !== undefined) {
      rollingWeeklyWeekday = extracted.rollingWeekly.weekday;
      auctionDate = extracted.dateIso ?? null;
      if (extracted.time) auctionTime = extracted.time;
      if (extracted.address) locationRaw = extracted.address;
      // „Prima licitație pe [dată] … se repetă săptămânal” → Data licitație 2 = prima dată + 7 zile
      if (extracted.dateIso2) dataLicitatie2 = extracted.dateIso2;
      if (extracted.time) oraLicitatie2 = extracted.time;
    } else if (extracted.dateIso) {
      auctionDate = extracted.dateIso;
      if (extracted.time) auctionTime = extracted.time;
      if (extracted.address) locationRaw = extracted.address;
    }
  }
  const saleType = detail.customFields.tipVanzare ?? null;
  const loc = locationRaw ? normalizeLocation(locationRaw) : { raw: "", city: null, county: null };
  const metaFields = Object.fromEntries(
    Object.entries(detail.customFields).filter(
      ([k]) => k !== "dataLicitatie" && k !== "oraLicitatie" && k !== "dataLicitatie2" && k !== "oraLicitatie2" && k !== "tipVanzare"
    )
  ) as Record<string, string>;
  if (rollingDaily) metaFields["Licitatie orice zi"] = "da";
  if (rollingWeeklyWeekday !== null) {
    const zile = ["duminica", "luni", "marti", "miercuri", "joi", "vineri", "sambata"];
    metaFields["Licitatie saptamanal"] = zile[rollingWeeklyWeekday] ?? String(rollingWeeklyWeekday);
  }
  if (dataLicitatie2) metaFields["Data licitatie 2"] = dataLicitatie2;
  if (oraLicitatie2) metaFields["Ora licitatie 2"] = oraLicitatie2;

  const byKey = (re: RegExp) => {
    const ent = Object.entries(detail.customFields).find(([k]) => re.test(k.trim()));
    return ent ? (ent[1] && String(ent[1]).trim()) || undefined : undefined;
  };
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[țţ]/g, "t").replace(/[ăâ]/g, "a");
  const fromMeta = (labelNorm: string) => {
    const n = norm(labelNorm);
    const ent = Object.entries(metaFields).find(([k]) => norm(k) === n);
    return ent ? (ent[1] && String(ent[1]).trim()) || undefined : undefined;
  };

  const infoMarca = byKey(/^marca$/i) ?? fromMeta("marca");
  const infoKm = byKey(/^km$/i) ?? fromMeta("km");
  const infoCombustibil = byKey(/combustibil/i) ?? fromMeta("combustibil");
  const infoAn = byKey(/an\s*fabricat/i) ?? fromMeta("an fabricatie");
  const infoCap = byKey(/capacitate\s*cilindrica/i) ?? fromMeta("capacitate cilindrica");
  const infoSuprafata = byKey(/suprafa[tț]/i) ?? fromMeta("Suprafata") ?? fromMeta("Suprafață");
  const infoTipImobil = byKey(/^tip\s*(teren|imobil)?$/i) ?? fromMeta("Tip") ?? fromMeta("Tip teren") ?? fromMeta("Tip imobil");
  const infoCamere = byKey(/^camere$/i) ?? fromMeta("Camere");
  const infoAnConstructie = byKey(/an\s*constructie/i) ?? fromMeta("An constructie");

  const update: Record<string, unknown> = {
    title: detail.title || undefined,
    category: detail.category ?? undefined,
    main_category: getMainCategoryFromSource(
      detail.category ?? null,
      detail.title ?? undefined,
      stripHtml(detail.descriptionHtml ?? "")
    ) ?? undefined,
    price_text: detail.priceText ?? undefined,
    published_at: detail.publishedAt?.toISOString() ?? undefined,
    location_raw: locationRaw ?? detail.locationRaw ?? undefined,
    location_city: loc.city ?? undefined,
    location_county: loc.county ?? undefined,
    auction_date: auctionDate ?? undefined,
    auction_time: auctionTime ?? undefined,
    sale_type: saleType ?? undefined,
    seller_name: detail.sellerName ?? undefined,
    seller_profile_url: detail.sellerProfileUrl ?? undefined,
    seller_email: detail.sellerEmail ?? undefined,
    seller_phone: detail.sellerPhone ?? undefined,
    seller_address: detail.sellerAddress ?? undefined,
    description_html: detail.descriptionHtml ?? undefined,
    pdf_url: detail.pdfUrls[0] ?? undefined,
    pdf_urls: detail.pdfUrls.length > 0 ? detail.pdfUrls : undefined,
    meta_fields: Object.keys(metaFields).length > 0 ? metaFields : undefined,
    info_marca: infoMarca ?? undefined,
    info_km: infoKm ?? undefined,
    info_combustibil: infoCombustibil ?? undefined,
    info_an_fabricatie: infoAn ?? undefined,
    info_capacitate_cilindrica: infoCap ?? undefined,
    info_suprafata: infoSuprafata ?? undefined,
    info_tip_imobil: infoTipImobil ?? undefined,
    info_camere: infoCamere ?? undefined,
    info_an_constructie: infoAnConstructie ?? undefined,
  };

  return { update, imageUrls: detail.imageUrls };
}
