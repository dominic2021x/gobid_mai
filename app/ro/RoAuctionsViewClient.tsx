"use client";

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import Hammer, { HammerIcon } from "../../components/Hammer";
import { HeartIcon, NotificationIcon, ClockIcon, LocationIcon, UserIcon, CoinsIcon, LockClosedIcon, LockOpenIcon, SearchIcon, TrophyIcon, CloseIcon } from "../../components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import RoPageFooter from "./RoPageFooter";
import supabase from "@/lib/supabase";
import { getSizeOptions } from "@/lib/categories";
import { getRoFilterSchema, EXEC_MAI_MULTE_DETALII_OPTIONS } from "@/lib/filters";
import { getBrandOptionsForSubcategory, getAttributesForSubcategory, COLOR_OPTIONS, normalizeConditionForForm } from "@/lib/attributes";
import { getModelsForBrand } from "@/lib/data/brand-models";
import { analyzeSearchForRo } from "../../lib/search-query-analyzer";
import { tipPiesaLabelToSlug } from "@/lib/piese-auto/tip-piesa-level3";
import { matchExtractedMarcaToBrandOption } from "@/lib/piese-auto/infer-from-title";
import { extractAutoBrandFromFineSearchText } from "@/lib/ai/brand-detector";
import { buildScenarios, auctionMatchesScenario, getScenarioSectionLabel, type ReasonFlags, type LadderSection } from "@/lib/search/fallbackLadder";
import {
  toPriceRonAndEur,
  ronToEur,
  getRonEurRate,
  eurAmountForListingDisplay,
  type DisplayCurrency,
} from "../../lib/currency";

/** Preț în moneda UI: EUR din listare nativă păstrat; EUR din RON rotunjit la 0/5 fără zecimale la afișare. */
function getAuctionDisplayPriceInSelectedCurrency(
  auction: { priceRon?: number; priceEur?: number; currentBid?: number; listingPricedInEur?: boolean },
  selectedCurrency: DisplayCurrency,
): number {
  const ronVal = Number(auction.priceRon ?? auction.currentBid ?? 0) || 0;
  const eurDirect = Number(auction.priceEur ?? 0) || 0;
  const eurVal = eurDirect > 0 ? eurDirect : ronVal > 0 ? ronToEur(ronVal) : 0;
  if (selectedCurrency !== "EUR") return ronVal;
  return eurAmountForListingDisplay(eurVal, auction.listingPricedInEur);
}

import { useExchangeRate } from "../../hooks/useExchangeRate";
import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { CDN_IMAGE_SIZES_GRID, getCdnImageUrl, listingGridTransformOptions } from "@/lib/image/cdn";
import { getFocalForImageUrl } from "@/lib/image/focal-from-product";
import { ProgressiveImage } from "@/components/image/ProgressiveImage";
import { notifyGuestFavoritesUpdated } from "@/lib/favorites/mergeGuestFavorites";
import SearchRecoveryCard from "@/components/ro/SearchRecoveryCard";
import { applyRoListingsFetchLocationMode, buildListingsApiParams } from "@/lib/ro/roListingsApiParams";
import { normalizeRoListingsSortKey, sortKeyToApiParam } from "@/lib/ro/roListingsSortParam";
import { stripBrandTokensFromSearchQuery } from "@/lib/listings/filters/searchQueryBrand";
import type { InitialListingsPayload, ResurseUtileLinkItem } from "./types";
import pLimit from "p-limit";
import { RoSortSelect } from "@/components/ui/ro-sort-select";
import { Input } from "@/components/ui/input";
import { persistRoMarketplaceUrl } from "@/lib/ro/roMarketplaceFooterPersistence";
import { cn } from "@/lib/utils";
import { ProductConditionBadge } from "@/components/ProductConditionBadge";
import { PieseAutoMarcaInlineSpan } from "@/components/piese-auto/PieseAutoMarcaBadges";
import {
  getMarcaFromListing,
  isPieseAutoListingProduct,
  type ListingMarcaFields,
} from "@/lib/piese-auto/listing-marca";
import { RoFilterSection } from "@/components/ro/RoFilterSection";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, LoaderCircle, MapPin, Search as LucideSearch, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  RoMobileMarketplaceFilters,
  type ConditionValue as MarketplaceConditionValue,
  type DatePostedValue as MarketplaceDatePostedValue,
} from "@/components/ro/RoMobileMarketplaceFilters";
import { haversineDistanceKm, parseCoordinatesJson } from "@/lib/geo/haversine";
import { LocationFilterAutocompleteInput } from "@/components/ro/LocationFilterAutocompleteInput";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import {
  buildRelaxedSuggestionList,
  getExplicitDisplayState,
  sortListingsByGeoDistance,
} from "@/lib/ro/clientListingFilters";
import {
  RO_LISTINGS_PAGE_SIZE_DESKTOP,
  RO_LISTINGS_PAGE_SIZE_MOBILE,
  RO_LISTINGS_MAX_PAGE,
} from "@/lib/ro/roListingsPagination";
import {
  getRoListingsPaginationFromSearchParams,
} from "@/lib/ro/normalizedListingsQuery";
import {
  buildRoListingFiltersSignatureForRestore,
  buildRoListingsCountQueryString,
  clearRoListingReturnState,
  getRoReturnStateStorageKey,
  normalizeReturnSearchSignature,
  RO_LISTING_RETURN_TTL_MS,
  type RoListingReturnPayload,
} from "@/lib/ro/listingReturnState";
import { isDefaultRoListingsHomeUrl } from "@/lib/ro/isDefaultRoListingsHome";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";

const AddToFavoriteListModal = dynamic(() => import("../../components/AddToFavoriteListModal"), { ssr: false });
const SearchableLocationSelect = dynamic(() => import("../../components/SearchableLocationSelect"), { ssr: true });

/** Hint marcă Search fin: „OK am înțeles” — localStorage permanent: per user când e logat; cheie guest pe browser când nu e logat. */
const SEARCH_FIN_BRAND_HINT_LS_PREFIX = "ro:searchFinBrandHintOk:";
/** Browser (profil): cât timp nu ești logat, nu mai arăta hint-ul după OK. */
const SEARCH_FIN_BRAND_HINT_GUEST_LS_KEY = "ro:searchFinBrandHintOk";
/** Migrare veche: era sessionStorage; citit o dată și mutat în localStorage. */
const SEARCH_FIN_BRAND_HINT_LEGACY_SS_KEY = "ro:searchFinBrandHintOk";

/** Opțiuni Sortare — sursă unică pentru SSR și client (evită nepotriviri la hidratare). */
const RO_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "priceLow", label: "Preț mic" },
  { value: "priceHigh", label: "Preț mare" },
  { value: "relevant", label: "Relevante" },
  { value: "newest", label: "Nou" },
  { value: "oldest", label: "Vechi" },
];

const RO_AUTO_LOCATION_ENABLED_KEY = "ro:autoLocationEnabled";
const RO_LAST_LOCATION_CENTER_KEY = "ro:lastLocationCenter";
const RO_LOCATION_PROMPT_SEEN_KEY = "ro:locationPromptSeen";
const RO_LOCATION_CENTER_UPDATED_EVENT = "gobid:location-center-updated";
const LEGACY_GEO_COORDS_KEY = "gobid:geolocation-coords";
const SHOW_RELAXED_SUGGESTIONS_SECTION = false;

/** Limitează paralelismul la resolve-location pentru „distanță până la centru” pe carduri (evită sute de fetch-uri simultane). */
const listingDistanceCoordResolveLimit = pLimit(5);
/** Max grupuri distincte oraș+județ rezolvate per tur (un singur HTTP per grup, nu per licitație). */
const MAX_UNIQUE_LOCATION_QUERIES_PER_COORD_BATCH = 24;

function stripMetropolitanZoneFromLocationQuery(q: string): string {
  const t = q.trim();
  const s = t.replace(/^\s*Zona\s+Metropolitan[ăa]\s+/i, "").trim();
  return s.length >= 2 ? s : t;
}

function normalizeLocationQueryDedupeKey(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Rază strictă pentru RPC (1–500 km). Nu folosi pentru `locationRadiusKm === 0` („Toată țara”). */
function clampRoRadiusKmForApi(km: number): number {
  return Math.min(500, Math.max(1, Math.round(Number.isFinite(km) ? km : 25)));
}

function parseExplicitRoListingsPageLimitLocal(source: URLSearchParams): number | null {
  const raw = source.get("limit")?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

/** Text comun: tooltip urgent pe card listă RO. */
const URGENT_LISTING_TOOLTIP =
  "Anunț urgent — prioritate pentru cei care pot finaliza rapid.";

/** Tooltip în portal + fixed: nu e acoperit de carduri vecine / nu e tăiat de overflow-hidden pe card. */
function UrgentListingTooltipIcon({ isDarkMode }: { isDarkMode: boolean }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTipPos({ left: r.left + r.width / 2, top: r.top - 8 });
  }, []);

  const show = useCallback(() => {
    updatePosition();
  }, [updatePosition]);

  const hide = useCallback(() => {
    setTipPos(null);
  }, []);

  useEffect(() => {
    if (!tipPos) return;
    const handler = () => {
      updatePosition();
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [tipPos, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        className="relative inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500/45"
        aria-label={URGENT_LISTING_TOOLTIP}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
      >
        <i className="ri-information-line text-[13px] opacity-80" aria-hidden />
      </span>
      {tipPos && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: "fixed",
                left: tipPos.left,
                top: tipPos.top,
                transform: "translate(-50%, -100%)",
                zIndex: 99999,
              }}
              className={cn(
                "pointer-events-none w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-md border px-2.5 py-1.5 text-left text-[11px] font-normal font-sans leading-snug shadow-xl",
                isDarkMode
                  ? "border-white/15 bg-gray-900 text-gray-100"
                  : "border-gray-200 bg-white text-gray-800",
              )}
            >
              {URGENT_LISTING_TOOLTIP}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

type StoredLocationCenter = {
  lat: number;
  lng: number;
  label?: string;
  publicLabel?: string;
  ts?: number;
};

function readStoredLocationCenter(): StoredLocationCenter | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RO_LAST_LOCATION_CENTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLocationCenter>;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      lat,
      lng,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
      publicLabel: typeof parsed.publicLabel === "string" ? parsed.publicLabel : undefined,
      ts: typeof parsed.ts === "number" ? parsed.ts : undefined,
    };
  } catch {
    return null;
  }
}

function getPublicLocationLabel(label?: string): string {
  const raw = String(label ?? "").trim();
  if (!raw || raw === "Locația mea") return "Locația mea";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] || "Locația mea";
}

function getPublicLocationLabelFromComponents(
  components?: Array<{ longName?: string; shortName?: string; types?: string[] }>,
  fallback?: string,
): string {
  const list = Array.isArray(components) ? components : [];
  const byType = (wanted: string[]) =>
    list.find((component) => {
      const types = Array.isArray(component.types) ? component.types : [];
      return wanted.some((type) => types.includes(type));
    });
  const city =
    byType(["locality", "postal_town", "administrative_area_level_2"])?.longName ||
    byType(["sublocality", "sublocality_level_1"])?.longName;
  const county = byType(["administrative_area_level_1", "state", "county"])?.longName;
  const parts = [city, county]
    .map((part) => String(part ?? "").trim().replace(/^Județul\s+/i, ""))
    .filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return getPublicLocationLabel(fallback);
}

function saveStoredLocationCenter(center: StoredLocationCenter): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RO_AUTO_LOCATION_ENABLED_KEY, "1");
  localStorage.setItem(RO_LAST_LOCATION_CENTER_KEY, JSON.stringify(center));
  localStorage.setItem(LEGACY_GEO_COORDS_KEY, JSON.stringify({ lat: center.lat, lng: center.lng }));
  window.dispatchEvent(new Event(RO_LOCATION_CENTER_UPDATED_EVENT));
}

function clearStoredLocationCenter(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RO_AUTO_LOCATION_ENABLED_KEY);
  localStorage.removeItem(RO_LAST_LOCATION_CENTER_KEY);
  localStorage.removeItem(LEGACY_GEO_COORDS_KEY);
  window.dispatchEvent(new Event(RO_LOCATION_CENTER_UPDATED_EVENT));
}

function markLocationPromptSeen() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RO_LOCATION_PROMPT_SEEN_KEY, "1");
  } catch {
    /* ignore storage errors */
  }
}

function parseSortParamFromUrl(raw: string | null | undefined): string {
  return normalizeRoListingsSortKey(raw);
}

function ResurseUtileBlock({ links }: { links: ResurseUtileLinkItem[] }) {
  if (links.length === 0) return null;
  return (
    <section
      className="mt-6 px-4 py-4 rounded-lg bg-slate-100/80 border border-slate-200"
      aria-label="Resurse utile"
    >
      <h2 className="text-lg font-semibold text-slate-900">Resurse utile</h2>
      <ul className="mt-2 space-y-1">
        {links.map((link, i) => (
          <li key={i}>
            <a href={link.target_url} className="text-slate-700 underline hover:text-slate-900">
              {link.anchor}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Normalizează pentru căutare – elimină diacritice (casa = casă) */
const normalizeForSearch = (s: string): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/**
 * Rezumat listă: marca apare deja în segment separat — scoatem prefixul din citatul lui q
 * ca să nu repetăm marca (ex. BMW · „BMW cablaj” → BMW · „cablaj”).
 */
function stripRedundantBrandPrefixFromSummaryQuery(brand: string, q: string): string {
  const b = brand.trim();
  const t = q.trim();
  if (!b || !t) return t;
  const escaped = b.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  const re = new RegExp(`^${escaped}(?:\\s+|$)`, "i");
  return t.replace(re, "").trim();
}

/** Fiecare cuvânt din ?q= trebuie să apară în titlu/categorie/sub/brand/locație (ca API); ordinea nu contează. Cu ?brand=, restul din q se potrivește doar în titlu (ca API). */
function auctionMatchesSearchQTokens(
  searchQ: string,
  auction: { title?: string; location?: string; category?: string; subcategory?: string; brand?: string },
  opts?: { queryTitleOnly?: boolean; categoryScope?: boolean }
): boolean {
  const raw = searchQ.trim();
  if (!raw) return true;
  const tokens = raw.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = opts?.queryTitleOnly
    ? normalizeForSearch(String(auction.title ?? ''))
    : opts?.categoryScope
      ? normalizeForSearch(
          [auction.title, auction.location, (auction as { brand?: string }).brand]
            .filter(Boolean)
            .join(' ')
        )
      : normalizeForSearch(
          [auction.title, auction.location, auction.category, auction.subcategory, (auction as { brand?: string }).brand]
            .filter(Boolean)
            .join(' ')
        );
  return tokens.every((tok) => {
    const nt = normalizeForSearch(tok);
    return nt.length > 0 && hay.includes(nt);
  });
}

/** Text căutabil pentru Search fin: locație (afișat + oraș + județ) */
function fineSearchLocationHaystack(a: { location?: string; city?: string; county?: string }): string {
  return normalizeForSearch(
    [a.location, a.city, a.county].map((x) => String(x ?? '').trim()).filter(Boolean).join(' '),
  );
}

/** Text căutabil pentru Search fin: preț RON/EUR (valori și formate ro-RO) */
function fineSearchPriceHaystack(a: {
  priceRon?: number;
  priceEur?: number;
  currentBid?: number;
  listingPricedInEur?: boolean;
}): string {
  const ron = Number(a.priceRon ?? a.currentBid ?? 0) || 0;
  const eurDirect = Number(a.priceEur ?? 0) || 0;
  const eur = eurDirect > 0 ? eurDirect : ron > 0 ? ronToEur(ron) : 0;
  const eurRounded = eurAmountForListingDisplay(eur, a.listingPricedInEur);
  const parts: string[] = [];
  const valuesToIndex = [ron, eur];
  if (!a.listingPricedInEur && eurRounded > 0 && Math.abs(eurRounded - eur) > 1e-9) {
    valuesToIndex.push(eurRounded);
  }
  for (const v of valuesToIndex) {
    if (!v || v <= 0) continue;
    parts.push(String(Math.round(v)));
    parts.push(v.toFixed(0));
    parts.push(v.toFixed(2));
    parts.push(v.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  }
  return normalizeForSearch(parts.join(' '));
}

/** Parse sumă din fragment (500, 1.500, 1500,5 — format ro). */
function parseLooseAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(/\u00a0/g, '');
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastComma > lastDot) {
    const intPart = s.slice(0, lastComma).replace(/\./g, '');
    const decPart = s.slice(lastComma + 1);
    if (!/^\d{1,2}$/.test(decPart)) return null;
    const n = parseFloat(`${intPart}.${decPart}`);
    return Number.isFinite(n) ? n : null;
  }
  if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    if (after.length === 3 && !s.includes(',')) {
      const n = parseFloat(s.replace(/\./g, ''));
      return Number.isFinite(n) ? n : null;
    }
    if (after.length <= 2) {
      const n = parseFloat(s.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    const n = parseFloat(s.replace(/\./g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrage plafon de preț din Search fin: „maxim 500”, „până la 1500”, „max 200 eur”.
 * Dacă sunt mai multe praguri, se folosește cel mai mic (cel mai strict).
 * Restul textului rămâne pentru căutare în titlu / descriere / locație.
 */
function parseFineSearchMaxClause(input: string): {
  maxAmount: number | null;
  priceCurrency: 'RON' | 'EUR' | null;
  textRest: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { maxAmount: null, priceCurrency: null, textRest: '' };

  const kw =
    '(?:maxim|maximum|max|cel\\s+mult|sub|pana\\s+la|pan\\s+la|până\\s+la)';
  const re = new RegExp(
    `${kw}\\s*([\\d\\s.\\u00a0]+(?:,\\d{1,2})?)(?:\\s*(EUR|EURO|RON|LEI))?`,
    'gi',
  );

  let best: { amount: number; currency: 'RON' | 'EUR' | null } | null = null;
  let textRest = trimmed;
  for (const m of trimmed.matchAll(re)) {
    const amt = parseLooseAmount(m[1]);
    if (amt == null) continue;
    const curStr = (m[2] || '').toUpperCase();
    let c: 'RON' | 'EUR' | null = null;
    if (curStr === 'EUR' || curStr === 'EURO') c = 'EUR';
    else if (curStr === 'RON' || curStr === 'LEI') c = 'RON';
    if (!best || amt < best.amount) {
      best = { amount: amt, currency: c };
    }
    textRest = textRest.replace(m[0], ' ');
  }
  textRest = textRest.replace(/\s+/g, ' ').trim();
  return {
    maxAmount: best?.amount ?? null,
    priceCurrency: best?.currency ?? null,
    textRest,
  };
}

/**
 * `q` în URL pentru Search fin: marca din chip + restul textului, fără a duplica marca în rest
 * (parseFineSearchMaxClause nu scoate marca — altfel devine „BMW BMW … x5”).
 */
function buildMarketplaceFineSearchQ(
  marketplaceSearchText: string,
  fineSearchLockedAutoBrand: string | null | undefined,
): string {
  const { textRest } = parseFineSearchMaxClause(marketplaceSearchText);
  let rest = textRest.trim();
  const locked = fineSearchLockedAutoBrand?.trim();
  if (locked) {
    const stripped = stripBrandTokensFromSearchQuery(rest, locked, undefined);
    rest = (stripped ?? '').trim();
  }
  return [locked, rest].filter(Boolean).join(' ').trim();
}

/** Placeholder câmp căutare listări /ro — scurt pe mobil ca să nu se taie înainte de icon. */
const RO_MARKETPLACE_SEARCH_PLACEHOLDER = "Ex.: model, an, motorizare…";

/** Prefix animat + exemplul de mai sus — pentru placeholder „scrie aici” în căutarea din catalog. */
const RO_MARKETPLACE_SEARCH_ANIMATED_LINE = `Începe să scrii — ${RO_MARKETPLACE_SEARCH_PLACEHOLDER}`;

/** Chenar negru când câmpul e gol; neutru când există text (nu portocaliu idle). */
const RO_SEARCH_INPUT_BORDER_EMPTY =
  "border-neutral-950 shadow-sm focus-visible:border-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:border-neutral-500 dark:focus-visible:border-neutral-400 dark:focus-visible:ring-neutral-400/20";

const RO_SEARCH_INPUT_BORDER_FILLED =
  "border-neutral-300 shadow-sm focus-visible:border-neutral-600 focus-visible:ring-2 focus-visible:ring-neutral-400/25 dark:border-neutral-600 dark:focus-visible:border-neutral-500 dark:focus-visible:ring-neutral-500/20";

/** Preț pentru comparație „maxim” — aceeași logică ca filtrul de interval preț. */
function auctionWithinFineSearchMax(
  a: any,
  maxAmount: number,
  clauseCurrency: 'RON' | 'EUR' | null,
  selectedCurrency: DisplayCurrency,
): boolean {
  const useEur =
    clauseCurrency === 'EUR' || (clauseCurrency == null && selectedCurrency === 'EUR');
  const ron = Number(a?.priceRon ?? a?.currentBid ?? 0) || 0;
  const eurDirect = Number(a?.priceEur ?? 0) || 0;
  const eur = eurDirect > 0 ? eurDirect : ron > 0 ? ronToEur(ron) : 0;
  const value = useEur ? eurAmountForListingDisplay(eur, a?.listingPricedInEur) : ron;
  return value <= maxAmount + 1e-6;
}

/** Search fin: marcă auto blocată — coloană brand sau numele mărcii în titlu/descriere. */
function auctionMatchesFineSearchAutoBrand(
  a: { brand?: string; title?: string; description?: string; shortDescription?: string },
  brandSlug: string,
  fullBrand: string,
): boolean {
  const ns = normalizeForSearch(brandSlug);
  const nf = normalizeForSearch(fullBrand);
  const nb = normalizeForSearch(String(a?.brand ?? ''));
  if (nb) {
    if (nb === ns || nb.includes(ns) || ns.includes(nb)) return true;
    if (nf && (nb.includes(nf) || nf.includes(nb))) return true;
  }
  const title = normalizeForSearch(String(a?.title ?? ''));
  const desc = normalizeForSearch(String(a?.description ?? a?.shortDescription ?? ''));
  const hay = `${title} ${desc}`;
  if (nf && hay.includes(nf)) return true;
  if (ns.length >= 2 && hay.includes(ns)) return true;
  return false;
}

/** Stare: pe piese-auto folosim doar Nou / Second hand (coloana `condition`, aliniat la CONDITION_OPTIONS). */
function auctionMatchesConditionFilter(
  auctionCondition: string | undefined,
  selectedSubcategory: string,
  condition: string,
  selectedConditions: string[],
): boolean {
  const isPiese = selectedSubcategory === "piese-auto";
  if (selectedConditions.length > 1) {
    if (isPiese) {
      const ac = normalizeConditionForForm(auctionCondition);
      return selectedConditions.some((sc) => normalizeConditionForForm(sc) === ac);
    }
    return selectedConditions.includes(String(auctionCondition ?? ""));
  }
  if (condition === "all") return true;
  if (isPiese) {
    return normalizeConditionForForm(auctionCondition) === normalizeConditionForForm(condition);
  }
  return String(auctionCondition ?? "") === condition;
}

/** Pentru filtrul level3 (tip piesă la piese-auto): eticheta din DB ≡ slug din URL (lib/piese-auto/tip-piesa-level3). */
function normalizeRoListingLevel3Key(value: string | undefined | null): string {
  return tipPiesaLabelToSlug(String(value ?? ""));
}

function auctionMatchesAnyPieseTipSlug(auctionL3: string | undefined, selectedSlugs: string[]): boolean {
  if (selectedSlugs.length === 0) return true;
  const a = normalizeRoListingLevel3Key(auctionL3);
  return selectedSlugs.some((s) => normalizeRoListingLevel3Key(s) === a);
}

/** Normalizează subcategoria la key (folosește schema canonică; produsele pot avea "Case și Vile" sau "case-vile"). */
function normalizeSubcategoryToKey(val: string, subcategoryNames: Record<string, string>): string {
  if (!val || typeof val !== "string") return "";
  const v = val.trim().toLowerCase();
  if (!v) return "";
  const normalize = (s: string) =>
    s.replace(/[ăâîșț]/g, (c) => ({ ă: "a", â: "a", î: "i", ș: "s", ț: "t" }[c] ?? c)).replace(/\s+/g, "-");
  const keys = new Set(Object.keys(subcategoryNames));
  if (keys.has(v)) return v;
  for (const [key, display] of Object.entries(subcategoryNames)) {
    if ((display ?? "").toLowerCase() === v) return key;
    if (normalize((display ?? "").toLowerCase()) === normalize(v)) return key;
  }
  return normalize(v);
}

// Helper functions pentru formatare consistentă (evită erori de hidratare)
const formatNumber = (num: number): string => {
  // Formatează numărul într-un mod consistent, folosind punct ca separator (format românesc)
  // Acest format este consistent pe server și client, evitând erori de hidratare
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatDate = (date: Date | string, options?: { day?: string; month?: string; year?: string }): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  // Formatează data într-un mod consistent
  const day = d.getDate().toString().padStart(2, '0');
  const monthNames = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const monthNamesFull = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const month = options?.month === 'long' ? monthNamesFull[d.getMonth()] : monthNames[d.getMonth()];
  const year = d.getFullYear();

  if (options?.day === '2-digit' && options?.month === 'short') {
    return `${day} ${month}`;
  }
  if (options?.year === 'numeric' && options?.month === 'long' && options?.day === 'numeric') {
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  }
  return `${day} ${month} ${year}`;
};

const formatRelativeAddedTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const timestamp = d.getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) return 'Acum puțin';

  const minutes = Math.floor(diffMs / minuteMs);
  if (minutes < 60) return minutes === 1 ? 'Acum 1 minut' : `Acum ${minutes} minute`;

  const hours = Math.floor(diffMs / hourMs);
  if (hours < 24) return hours === 1 ? 'Acum 1 oră' : `Acum ${hours} ore`;

  const days = Math.floor(diffMs / dayMs);
  return days === 1 ? 'Acum 1 zi' : `Acum ${days} zile`;
};

const formatDistanceKmLabel = (distanceKm: number): string => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '';
  if (distanceKm < 1) return 'sub 1 km';
  if (distanceKm < 10) {
    const rounded = Math.round(distanceKm * 10) / 10;
    return `${String(rounded).replace('.', ',')} km`;
  }
  return `${Math.round(distanceKm)} km`;
};

const getAuctionDistanceKm = (
  auction: { coordinates?: unknown; custom_fields?: Record<string, unknown> | null },
  origin: { lat: number | null; lng: number | null }
): number | null => {
  if (
    origin.lat == null ||
    origin.lng == null ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng)
  ) {
    return null;
  }
  const point =
    parseCoordinatesJson(auction.coordinates) ||
    parseCoordinatesJson(auction.custom_fields?.coordinates);
  if (!point) return null;
  return haversineDistanceKm({ lat: origin.lat, lng: origin.lng }, point);
};

type RoListingsResponse = {
  success: boolean;
  items?: any[];
  nextFrom?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  total?: number;
  /** Aliniat cu `count_ro_listings_enterprise_estimate` — `exact` | `estimate` | `capped`. */
  total_kind?: "exact" | "estimate" | "capped";
  /** Server poate injecta centrul din text locație (distance-first fără geocode client). */
  resolved_center?: { lat: number; lng: number; match: string };
  error?: string;
};

const RO_LISTINGS_CLIENT_CACHE_TTL_MS = 30_000;
const RO_LISTINGS_CLIENT_CACHE_MAX_ENTRIES = 60;
const RO_LISTINGS_SESSION_PREFIX = "roListings:v1:";

function roListingsUrlHashKey(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return `${RO_LISTINGS_SESSION_PREFIX}${(h >>> 0).toString(16)}`;
}

type RoListingsClientCacheEntry = {
  payload: RoListingsResponse;
  ts: number;
};

const roListingsClientCache = new Map<string, RoListingsClientCacheEntry>();
const roListingsInFlight = new Map<string, Promise<RoListingsResponse>>();

function createAbortError(): Error {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

function getRoListingsClientCache(url: string): RoListingsResponse | null {
  const entry = roListingsClientCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > RO_LISTINGS_CLIENT_CACHE_TTL_MS) {
    roListingsClientCache.delete(url);
    return null;
  }
  return entry.payload;
}

function setRoListingsClientCache(url: string, payload: RoListingsResponse): void {
  roListingsClientCache.set(url, { payload, ts: Date.now() });
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(
        roListingsUrlHashKey(url),
        JSON.stringify({ payload, ts: Date.now() }),
      );
    } catch {
      // ignore quota / private mode
    }
  }
  if (roListingsClientCache.size <= RO_LISTINGS_CLIENT_CACHE_MAX_ENTRIES) return;
  const oldestKey = roListingsClientCache.keys().next().value as string | undefined;
  if (oldestKey) roListingsClientCache.delete(oldestKey);
}

async function fetchRoListingsJsonCached(url: string, signal?: AbortSignal): Promise<RoListingsResponse> {
  if (signal?.aborted) throw createAbortError();

  const cached = getRoListingsClientCache(url);
  if (cached) {
    if (signal?.aborted) throw createAbortError();
    return cached;
  }

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(roListingsUrlHashKey(url));
      if (raw) {
        const entry = JSON.parse(raw) as { payload?: RoListingsResponse; ts?: number };
        if (entry?.payload && typeof entry.ts === "number" && Date.now() - entry.ts <= RO_LISTINGS_CLIENT_CACHE_TTL_MS) {
          setRoListingsClientCache(url, entry.payload);
          if (signal?.aborted) throw createAbortError();
          return entry.payload;
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * In-flight dedupe shares one `fetch()` per URL. If another caller aborts that fetch,
   * waiters with a still-live signal must start a fresh request (otherwise NS_BINDING_ABORTED
   * leaves the UI stuck or empty).
   */
  for (;;) {
    if (signal?.aborted) throw createAbortError();

    let promise = roListingsInFlight.get(url);
    if (!promise) {
      promise = fetch(url, {
        method: "GET",
        cache: "no-store",
        signal,
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as RoListingsResponse;
        setRoListingsClientCache(url, payload);
        return payload;
      });
      roListingsInFlight.set(url, promise);
      promise.then(
        () => roListingsInFlight.delete(url),
        () => roListingsInFlight.delete(url),
      );
    }

    try {
      const payload = await promise;
      if (signal?.aborted) throw createAbortError();
      return payload;
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort && signal?.aborted) throw e;
      if (isAbort) continue;
      throw e;
    }
  }
}

interface AuctionsPageContentProps {
  resurseUtileLinks?: ResurseUtileLinkItem[];
  initialListings?: InitialListingsPayload;
  /** Din RSC: `q` după aceeași sanitizare ca listările — aliniază SSR cu primul paint client. */
  initialMarketplaceQ?: string;
}

function AuctionsPageContent({ resurseUtileLinks, initialListings, initialMarketplaceQ }: AuctionsPageContentProps = {}) {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? "";
  const router = useRouter();
  const [isRouteTransitionPending, startRouteTransition] = useTransition();
  const { rate: exchangeRate, rateDate: exchangeRateDate } = useExchangeRate();
  const searchQ = (searchParams?.get?.('q') ?? '').trim();
  const urlBrandParam = (searchParams?.get?.('brand') ?? '').trim();
  const searchQTitleOnly =
    urlBrandParam.length > 0 && urlBrandParam.toLowerCase() !== 'all';
  const [marketplaceSearchText, setMarketplaceSearchText] = useState(
    () => (initialMarketplaceQ !== undefined ? initialMarketplaceQ : searchQ),
  );
  const [showQuickSuggestions, setShowQuickSuggestions] = useState(false);
  const [quickSearchBrands, setQuickSearchBrands] = useState<Array<{ display: string; q: string }>>([]);
  const [quickSearchCategories, setQuickSearchCategories] = useState<Array<{ display: string; q: string }>>([]);
  const [quickSearchSubcategories, setQuickSearchSubcategories] = useState<Array<{ display: string; q: string }>>([]);
  const [quickSearchSuggestions, setQuickSearchSuggestions] = useState<Array<string | { display: string; q: string }>>([]);
  const [quickProductSuggestions, setQuickProductSuggestions] = useState<Array<{ id: string; title: string; image?: string; price?: number; category?: string; url?: string }>>([]);
  const quickSuggestionsRef = useRef<HTMLDivElement>(null);
  const quickSuggestionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roMarketplaceSearchUrlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prefetch primul page listings înainte/după schimbare `q` — lovește cache-ul din `fetchRoListingsJsonCached`. */
  const roListingsPrefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchRoMarketplaceFirstPageRef = useRef<(sp: URLSearchParams) => void>(() => {});
  const quickSearchSuggestionCacheRef = useRef(
    new Map<string, { suggestions: Array<{ display: string; q: string }>; ts: number }>(),
  );
  /** După prima restaurare la back, se resetează la deschiderea unui nou anunț ca următorul back să poată rula din nou. */
  const restoredRoListReturnRef = useRef(false);
  const prevSelectedCategoryForSearchRef = useRef<string | null>(null);

  // Evită conflictele cu scroll restoration implicit la BFCache/back — poziția exactă vine din storage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const had = "scrollRestoration" in history;
    const previous = had ? history.scrollRestoration : null;
    if (had) history.scrollRestoration = "manual";
    return () => {
      if (had && previous != null) history.scrollRestoration = previous;
    };
  }, []);

  // Persistă ?… pentru footer mobil „Anunțuri” (revenire la aceleași filtre).
  useEffect(() => {
    persistRoMarketplaceUrl(searchParamsString);
  }, [searchParamsString]);

  // Analiză query pentru inferare categorie, subcategorie, brand și termeni înrudiți
  const searchAnalysis = useMemo(
    () => (searchQ ? analyzeSearchForRo(searchQ) : null),
    [searchQ]
  );

  // Auto-activează filtrele când utilizatorul vine cu ?q= din sugestie (ex: iPhone 14, aripa golf 5)
  const hasAutoAppliedRef = useRef(false);
  useEffect(() => {
    if (!searchQ || !searchAnalysis || typeof window === 'undefined') return;
    const urlCat = searchParams?.get?.('category') ?? '';
    const { categoryKey, subcategoryKey, brand, level3, modelQuery, location: inferredLocation } = searchAnalysis;
    const brandTrim = brand?.trim() ?? '';
    /** Text rămas după eliminarea mărcii din query — căutat în titlu (API), marcă separată în ?brand= */
    const qAfterBrand = brandTrim
      ? (stripBrandTokensFromSearchQuery(searchQ, brandTrim, undefined) ?? '').trim()
      : searchQ.trim();

    // 1) Doar marcă detectată în text (fără categorie din lexicon): ?brand= + ?q= rest în titlu.
    // IMPORTANT: doar când NU există încă ?category= în URL. Altfel ștergem q aici, Search fin îl
    // repune la debounce-ul scurt de sincronizare URL (combined = marcă din chip) → buclă infinită router.replace + RSC.
    if (
      !urlCat &&
      categoryKey === 'all' &&
      brandTrim &&
      qAfterBrand !== searchQ.trim()
    ) {
      const params = new URLSearchParams(window.location.search);
      const curB = params.get('brand')?.trim() ?? '';
      const curQ = params.get('q')?.trim() ?? '';
      if (
        normalizeForSearch(curB) === normalizeForSearch(brandTrim) &&
        curQ === qAfterBrand
      ) {
        return;
      }
      params.set('brand', brandTrim);
      if (qAfterBrand) params.set('q', qAfterBrand);
      else params.delete('q');
      startRouteTransition(() => {
        router.replace(`/ro?${params.toString()}`, { scroll: false });
      });
      return;
    }

    if (urlCat) return; // deja avem categorii în URL, nu suprascriem
    if (categoryKey === 'all') return;
    if (hasAutoAppliedRef.current) return;
    hasAutoAppliedRef.current = true;
    setSelectedCategories([]);
    setSelectedCategory(categoryKey);
    setSelectedSubcategory(subcategoryKey);
    setSelectedSubcategories(subcategoryKey !== 'all' ? [subcategoryKey] : []);
    if (subcategoryKey === 'piese-auto' && level3 && level3 !== 'all') {
      setSelectedPieseTipSlugs([level3]);
      setSelectedLevel3('all');
    } else {
      setSelectedLevel3(level3 && level3 !== 'all' ? level3 : 'all');
      setSelectedPieseTipSlugs([]);
    }
    setSelectedBrand(brand && brand.trim() ? brand : 'all');
    setSelectedModel(modelQuery && modelQuery.trim() ? modelQuery.trim() : 'all');
    if (inferredLocation) {
      setLocation(inferredLocation);
      setSelectedLocations([inferredLocation]);
    }
    const params = new URLSearchParams(window.location.search);
    const qForUrl = brandTrim ? qAfterBrand : searchQ;
    if (qForUrl) params.set('q', qForUrl);
    else params.delete('q');
    params.set('category', categoryKey);
    if (subcategoryKey !== 'all') params.set('subcategory', subcategoryKey);
    if (level3 && level3 !== 'all') params.set('level3', level3);
    else params.delete('level3');
    if (brandTrim) params.set('brand', brandTrim);
    else params.delete('brand');
    if (modelQuery && modelQuery.trim()) params.set('model', modelQuery.trim());
    else params.delete('model');
    if (inferredLocation) params.set('location', inferredLocation);
    else params.delete('location');
    startRouteTransition(() => {
      router.replace(`/ro?${params.toString()}`, { scroll: false });
    });
  }, [searchQ, searchAnalysis, searchParams?.get?.('category'), router, startRouteTransition]);

  // Reset ref când se schimbă query-ul (altă căutare)
  useEffect(() => {
    if (!searchQ) hasAutoAppliedRef.current = false;
  }, [searchQ]);

  // Sincronizează TOATE filtrele din URL la încărcare / navigare
  const getParam = (k: string) => (searchParams?.get?.(k) ?? '').trim();
  const filterSchema = useMemo(() => getRoFilterSchema(), []);
  const categories = useMemo(() => {
    const m: Record<string, { name: string; subcategories: string[] }> = {
      all: { name: "Toate categoriile", subcategories: [] },
    };
    for (const c of filterSchema.categories) {
      m[c.slug] = { name: c.name, subcategories: c.subcategories };
    }
    return m;
  }, [filterSchema]);
  const subcategoryNames = filterSchema.subcategoryNames;
  const categoryKeys = useMemo(
    () => filterSchema.categories.map((c) => c.slug),
    [filterSchema]
  );
  useEffect(() => {
    const urlScope = getParam('scope').toLowerCase();
    if (urlScope === 'live_bid' || urlScope === 'executari') setListingsScope(urlScope);
    else setListingsScope('all');
    const includeExecParam = getParam('includeExecutari').toLowerCase();
    setIncludeExecutariCrosslist(
      includeExecParam === '1' ||
      includeExecParam === 'true' ||
      includeExecParam === 'on' ||
      includeExecParam === 'yes'
    );

    let cat = getParam('category').toLowerCase();
    const categoriesParam = getParam('categories')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => !!c && c !== 'all' && !!(categories as Record<string, { name: string; subcategories: string[] }>)[c]);
    const subcategoriesParam = getParam('subcategories')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (cat === 'executari-silite') cat = 'executari';
    let sub = getParam('subcategory').toLowerCase();
    const execSubMap: Record<string, string> = { 'imobile-executari': 'exec-imobiliare', 'terenuri-executari': 'exec-imobiliare', 'masini-executari': 'exec-autovehicule', 'utilaje-executari': 'exec-industrial' };
    if (cat === 'executari' && sub && execSubMap[sub]) sub = execSubMap[sub];
    const l3 = getParam('level3').toLowerCase();
    const level3sParam = getParam('level3s')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const urlBrand = getParam('brand');
    const brandsParam = getParam('brands').split(',').map((v) => v.trim()).filter(Boolean);
    const sizesParam = getParam('sizes').split(',').map((v) => v.trim()).filter(Boolean);
    const modelsParam = getParam('models').split(',').map((v) => v.trim()).filter(Boolean);
    const colorsParam = getParam('colors').split(',').map((v) => v.trim()).filter(Boolean);
    const locationsParam = getParam('locations').split(',').map((v) => v.trim()).filter(Boolean);
    const conditionsParam = getParam('conditions').split(',').map((v) => v.trim()).filter(Boolean);
    const urlCurrency = getParam('currency').toLowerCase();
    if (urlCurrency === 'eur') setSelectedCurrency('EUR');
    else if (urlCurrency === 'ron') setSelectedCurrency('RON');
    const catEntry = cat ? (categories as Record<string, { name: string; subcategories: string[] }>)[cat] : null;
    const execMain = getParam('execMain').trim();
    const execCatsParam = getParam('execCats')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const execCat = getParam('execCat').trim();
    const execSelectedListCategories = execCatsParam.length > 0
      ? Array.from(new Set(execCatsParam))
      : (execCat ? [execCat] : []);
    if (categoriesParam.length > 1) {
      setSelectedCategories(Array.from(new Set(categoriesParam)));
      setSelectedCategory('all');
      setSelectedSubcategory('all');
      setSelectedSubcategories([]);
      setSelectedExecutariMainCategory('');
      setSelectedExecutariListCategory('');
      setSelectedExecutariListCategories([]);
      setSelectedExecutariListCategories([]);
      setSelectedLevel3('all');
      setSelectedPieseTipSlugs([]);
    } else if (categoriesParam.length === 1) {
      const singleCategory = categoriesParam[0];
      const singleEntry = (categories as Record<string, { name: string; subcategories: string[] }>)[singleCategory];
      setSelectedCategories([singleCategory]);
      setSelectedCategory(singleCategory);
      setSelectedExecutariMainCategory('');
      setSelectedExecutariListCategory('');
      setSelectedExecutariListCategories([]);
      setSelectedExecutariListCategories([]);
      if (singleEntry) {
        const validMultiSubs = subcategoriesParam.filter((s) => singleEntry.subcategories.includes(s));
        if (validMultiSubs.length > 0) {
          setSelectedSubcategories(Array.from(new Set(validMultiSubs)));
          setSelectedSubcategory(validMultiSubs.length === 1 ? validMultiSubs[0] : 'all');
        } else if (sub && singleEntry.subcategories.includes(sub)) {
          setSelectedSubcategory(sub);
          setSelectedSubcategories([sub]);
        } else {
          setSelectedSubcategory('all');
          setSelectedSubcategories([]);
        }
        setSelectedLevel3('all');
        setSelectedPieseTipSlugs([]);
      }
    } else if (catEntry) {
      setSelectedCategories([]);
      setSelectedCategory(cat);
      if (cat === 'executari') {
        setSelectedExecutariMainCategory(execMain || '');
        setSelectedExecutariListCategory(execSelectedListCategories.length === 1 ? execSelectedListCategories[0] : '');
        setSelectedExecutariListCategories(execSelectedListCategories);
        const validMultiSubs = subcategoriesParam.filter((s) => catEntry.subcategories.includes(s));
        if (validMultiSubs.length > 0) {
          setSelectedSubcategories(Array.from(new Set(validMultiSubs)));
          setSelectedSubcategory(validMultiSubs.length === 1 ? validMultiSubs[0] : 'all');
        } else if (sub && catEntry.subcategories.includes(sub)) {
          setSelectedSubcategory(sub);
          setSelectedSubcategories([sub]);
        } else {
          setSelectedSubcategory('all');
          setSelectedSubcategories([]);
        }
        const terenuriLevel3Slugs = ['terenuri-intravilane', 'terenuri-extravilane', 'terenuri-agricole'];
        if (l3 && terenuriLevel3Slugs.includes(l3)) setSelectedLevel3(l3);
        else setSelectedLevel3(l3 || 'all');
      } else {
        setSelectedExecutariMainCategory('');
        setSelectedExecutariListCategory('');
        setSelectedExecutariListCategories([]);
        setSelectedExecutariListCategories([]);
        const validMultiSubs = subcategoriesParam.filter((s) => catEntry.subcategories.includes(s));
        if (validMultiSubs.length > 0) {
          setSelectedSubcategories(Array.from(new Set(validMultiSubs)));
          setSelectedSubcategory(validMultiSubs.length === 1 ? validMultiSubs[0] : 'all');
          setSelectedLevel3('all');
          setSelectedPieseTipSlugs([]);
        } else if (sub && catEntry.subcategories.includes(sub)) {
          setSelectedSubcategory(sub);
          setSelectedSubcategories([sub]);
          const level3Opts = filterSchema.level3BySubcategory[sub];
          if (sub === 'piese-auto') {
            const combined = [...level3sParam, ...(l3 ? [l3] : [])];
            const valid = Array.from(new Set(combined.filter((s) => level3Opts?.includes(s))));
            setSelectedPieseTipSlugs(valid);
            setSelectedLevel3('all');
          } else {
            setSelectedPieseTipSlugs([]);
            if (l3 && level3Opts?.includes(l3)) setSelectedLevel3(l3);
            else setSelectedLevel3(l3 || 'all');
          }
        } else {
          setSelectedSubcategory(sub || 'all');
          setSelectedSubcategories(sub ? [sub] : []);
          setSelectedLevel3('all');
          setSelectedPieseTipSlugs([]);
        }
      }
    } else if (!cat) {
      // Când avem ?q= dar fără category, auto-apply va seta filtrele din searchAnalysis – nu reseta
      if (!getParam('q')) {
        setSelectedCategories([]);
        setSelectedCategory('all');
        setSelectedSubcategory('all');
        setSelectedSubcategories([]);
        setSelectedExecutariMainCategory('');
        setSelectedExecutariListCategory('');
        setSelectedExecutariListCategories([]);
        setSelectedExecutariListCategories([]);
        setSelectedLevel3('all');
        setSelectedPieseTipSlugs([]);
      }
    }
    const skipBrandSync = !cat && !urlBrand && searchAnalysis?.categoryKey !== 'all';
    if (!skipBrandSync) {
      setSelectedBrand(urlBrand || 'all');
      setSelectedBrands(brandsParam.length > 0 ? brandsParam : (urlBrand ? [urlBrand] : []));
    } else {
      setSelectedBrand('all');
      setSelectedBrands([]);
    }
    const sizeParam = getParam('size') || 'all';
    setSelectedSize(sizeParam);
    setSelectedSizes(sizesParam.length > 0 ? sizesParam : (sizeParam !== 'all' ? [sizeParam] : []));
    const colorParam = getParam('color') || 'all';
    setSelectedColor(colorParam);
    setSelectedColors(colorsParam.length > 0 ? colorsParam : (colorParam !== 'all' ? [colorParam] : []));
    const modelParam = getParam('model') || 'all';
    setSelectedModel(modelParam);
    setSelectedModels(modelsParam.length > 0 ? modelsParam : (modelParam !== 'all' ? [modelParam] : []));
    setPriceRange({ min: getParam('priceMin'), max: getParam('priceMax') });
    const loc = getParam('location') || getParam('city');
    const rkRaw = parseFloat(getParam('radiusKm') || '');
    const parsedRadiusKm = Number.isFinite(rkRaw) && rkRaw > 0 && rkRaw <= 500 ? Math.round(rkRaw) : 0;
    setLocationRadiusKm(parsedRadiusKm);
    setRemoteLocationRadiusKm(parsedRadiusKm);
    {
      const hasUrlCityFilter =
        locationsParam.length > 0 || (!!loc && String(loc).trim() !== "" && String(loc) !== "all");
      const storedGpsCenter = readStoredLocationCenter();
      const storedGpsLabel = getPublicLocationLabel(storedGpsCenter?.publicLabel || storedGpsCenter?.label);
      const urlLocationLabel = locationsParam.length === 1 ? locationsParam[0] : loc || "";
      const urlMatchesStoredGps =
        storedGpsCenter &&
        localStorage.getItem(RO_AUTO_LOCATION_ENABLED_KEY) === "1" &&
        urlLocationLabel.trim().toLowerCase() === storedGpsLabel.trim().toLowerCase();
      if (hasUrlCityFilter && urlMatchesStoredGps) {
        setLocation("all");
        setSelectedLocations([]);
        setLocationCenterFromGps(true);
        setNearLat(storedGpsCenter.lat);
        setNearLng(storedGpsCenter.lng);
        setLocationSearch(storedGpsLabel);
      } else if (hasUrlCityFilter) {
        setLocation(loc || 'all');
        setSelectedLocations(locationsParam.length > 0 ? locationsParam : (loc ? [loc] : []));
        setLocationCenterFromGps(false);
        setLocationSearch(urlLocationLabel);
      } else {
        setLocation(loc || 'all');
        setSelectedLocations(locationsParam.length > 0 ? locationsParam : (loc ? [loc] : []));
      }
    }
    {
      const nLatRaw = parseFloat(getParam("nearLat") || "");
      const nLngRaw = parseFloat(getParam("nearLng") || "");
      if (Number.isFinite(nLatRaw) && Number.isFinite(nLngRaw)) {
        setNearLat(nLatRaw);
        setNearLng(nLngRaw);
      }
    }
    const cond = getParam('condition');
    setCondition(cond || 'all');
    setSelectedConditions(conditionsParam.length > 0 ? conditionsParam : (cond ? [cond] : []));
    const imagesParam = getParam('images').toLowerCase();
    setImageFilter(imagesParam === 'with' ? 'with' : 'all');
    const vanzatorParts = getParam('vanzator')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v): v is 'particular' | 'companie' => v === 'particular' || v === 'companie');
    setSelectedSellerKinds(Array.from(new Set(vanzatorParts)));
    {
      const foRaw = `${getParam("freeOnly") || getParam("free") || ""}`.trim().toLowerCase();
      setMarketplaceFreeOnly(foRaw === "1" || foRaw === "true" || foRaw === "on" || foRaw === "yes");
    }
    setSortBy(parseSortParamFromUrl(getParam("sort")));
    setDetailedFilters(prev => ({
      ...prev,
      rooms: getParam('rooms') || prev.rooms,
      surface: { min: getParam('surfaceMin') || prev.surface.min, max: getParam('surfaceMax') || prev.surface.max },
      floor: { min: getParam('floorMin') || prev.floor.min, max: getParam('floorMax') || prev.floor.max },
      buildingYear: { min: getParam('buildingYearMin') || prev.buildingYear.min, max: getParam('buildingYearMax') || prev.buildingYear.max },
      landSurface: { min: getParam('landSurfaceMin') || prev.landSurface.min, max: getParam('landSurfaceMax') || prev.landSurface.max },
      garden: getParam('garden') === '1' || getParam('garden') === 'true',
      garage: getParam('garage') === '1' || getParam('garage') === 'true',
      pool: getParam('pool') === '1' || getParam('pool') === 'true',
      terrainType: getParam('terrainType') || prev.terrainType,
      year: { min: getParam('yearMin') || prev.year.min, max: getParam('yearMax') || prev.year.max },
      mileage: { min: getParam('mileageMin') || prev.mileage.min, max: getParam('mileageMax') || prev.mileage.max },
      capacitateCilindrica: { min: getParam('capMin') || prev.capacitateCilindrica?.min || '', max: getParam('capMax') || prev.capacitateCilindrica?.max || '' },
      fuelType: getParam('fuelType') || prev.fuelType,
      transmission: getParam('transmission') || prev.transmission,
      executionType: getParam('executionType') || prev.executionType,
      court: getParam('court') || prev.court,
      debtor: getParam('debtor') || prev.debtor,
      executionValue: { min: getParam('executionValueMin') || prev.executionValue.min, max: getParam('executionValueMax') || prev.executionValue.max }
    }));
  }, [searchParamsString, filterSchema]);

  const fetchQuickSuggestions = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setQuickSearchBrands([]);
      setQuickSearchCategories([]);
      setQuickSearchSubcategories([]);
      setQuickSearchSuggestions([]);
      setQuickProductSuggestions([]);
      setShowQuickSuggestions(false);
      return;
    }
    const cacheKey = query.trim().toLowerCase();
    const cached = quickSearchSuggestionCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < 30_000) {
      setQuickSearchBrands([]);
      setQuickSearchCategories([]);
      setQuickSearchSubcategories([]);
      setQuickSearchSuggestions(cached.suggestions);
      setQuickProductSuggestions([]);
      setShowQuickSuggestions(cached.suggestions.length > 0);
      return;
    }
    try {
      const response = await fetch(`/api/ro/search/suggest?q=${encodeURIComponent(query)}&limit=10`, {
        cache: "force-cache",
      });
      const data = (await response.json()) as { ok?: boolean; items?: Array<{ phrase: string }> };
      const items = Array.isArray(data?.items) ? data.items : [];
      const suggestions: Array<{ display: string; q: string }> = items.map((i) => ({
        display: i.phrase,
        q: i.phrase,
      }));
      quickSearchSuggestionCacheRef.current.set(cacheKey, { suggestions, ts: Date.now() });
      setQuickSearchBrands([]);
      setQuickSearchCategories([]);
      setQuickSearchSubcategories([]);
      setQuickSearchSuggestions(suggestions);
      setQuickProductSuggestions([]);
      setShowQuickSuggestions(suggestions.length > 0);
    } catch (e) {
      console.error('Quick suggestions error:', e);
      setShowQuickSuggestions(false);
    }
  }, []);

  useEffect(() => {
    const q = marketplaceSearchText.trim();
    if (q.length >= 2) {
      if (quickSuggestionsDebounceRef.current) clearTimeout(quickSuggestionsDebounceRef.current);
      quickSuggestionsDebounceRef.current = setTimeout(() => fetchQuickSuggestions(q), 140);
      return () => {
        if (quickSuggestionsDebounceRef.current) clearTimeout(quickSuggestionsDebounceRef.current);
      };
    } else {
      setQuickSearchBrands([]);
      setQuickSearchCategories([]);
      setQuickSearchSubcategories([]);
      setQuickSearchSuggestions([]);
      setQuickProductSuggestions([]);
      setShowQuickSuggestions(false);
    }
  }, [marketplaceSearchText, fetchQuickSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (quickSuggestionsRef.current && !quickSuggestionsRef.current.contains(target)) {
        setShowQuickSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Nu mai forțăm rerender global la fiecare secundă.
  // Acest tick genera recalculări grele pe toată lista și creștea TBT în Lighthouse.

  const searchOrchestratorSubmitRef = useRef<((q: string) => Promise<void>) | null>(null);
  const applyQuickSuggestion = useCallback((item: string | { display: string; q: string }) => {
    const q = typeof item === "string" ? item : item.q;
    if (!q) return;
    setShowQuickSuggestions(false);
    if (searchOrchestratorSubmitRef.current) {
      void searchOrchestratorSubmitRef.current(q);
    } else {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      params.set("q", q);
      router.push(`/ro?${params.toString()}`);
    }
  }, [router]);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasSavedFilters, setHasSavedFilters] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });
  const [unlockedAuctions, setUnlockedAuctions] = useState<string[]>([]);
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [auctionNotifications, setAuctionNotifications] = useState<{ [key: string]: { enabled: boolean, timeBefore: string } }>({});
  const [message, setMessage] = useState({ type: '', text: '' });
  /** Scope: 'all' = toate, 'live_bid' = exclude anunțuri cu tokeni, 'executari' = doar Executări și Insolvență */
  const [listingsScope, setListingsScope] = useState<'all' | 'live_bid' | 'executari'>('all');
  const [includeExecutariCrosslist, setIncludeExecutariCrosslist] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  // Executări și Insolvență: Cat. principală + Mai multe detalii (list_category)
  const [selectedExecutariMainCategory, setSelectedExecutariMainCategory] = useState('');
  const [selectedExecutariListCategory, setSelectedExecutariListCategory] = useState('');
  const [selectedExecutariListCategories, setSelectedExecutariListCategories] = useState<string[]>([]);
  const [selectedLevel3, setSelectedLevel3] = useState('all');
  /** Piese auto: tip piesă multi-select (slug-uri), ca la Locație */
  const [selectedPieseTipSlugs, setSelectedPieseTipSlugs] = useState<string[]>([]);
  const [tipPiesaSearch, setTipPiesaSearch] = useState('');
  /** Icon stânga Search fin: spinner în timpul tastării (debounce după ultima tastă). */
  const [fineSearchIconBusy, setFineSearchIconBusy] = useState(false);
  /** Marcă auto „blocată” în Search fin (chenar verde) — rămâne până la X; nu se șterge odată cu textul. */
  const [fineSearchLockedAutoBrand, setFineSearchLockedAutoBrand] = useState<string | null>(null);
  const [fineSearchLockedAutoSlug, setFineSearchLockedAutoSlug] = useState<string | null>(null);
  /** Placeholder animat (typewriter) pentru Search fin și căutare catalog */
  const [fineSearchTypewriter, setFineSearchTypewriter] = useState('');
  const [quickSearchTypewriter, setQuickSearchTypewriter] = useState('');
  /** Animarea placeholder-ului rulează doar când câmpul nu e focuit */
  const [marketplaceSearchFocused, setMarketplaceSearchFocused] = useState(false);
  const [searchFinHelpOpen, setSearchFinHelpOpen] = useState(false);
  /** După „OK, am înțeles”: ascunde hint-ul; pe mobil ascunde și eticheta „Search fin”. */
  const [searchFinBrandHintDismissed, setSearchFinBrandHintDismissed] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState('all');
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('all');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState('all');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [selectedCurrency, setSelectedCurrency] = useState<DisplayCurrency>('RON');
  const [location, setLocation] = useState('all');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [condition, setCondition] = useState('all');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [imageFilter, setImageFilter] = useState<'all' | 'with'>('all');
  /** Particular / Companie — filtru activ doar când e bifat exact un tip (ambele sau niciunul = fără filtru). */
  const [selectedSellerKinds, setSelectedSellerKinds] = useState<Array<'particular' | 'companie'>>([]);
  const [sortBy, setSortBy] = useState(() => parseSortParamFromUrl(searchParams.get("sort")));
  const [timeRemainingFilter, setTimeRemainingFilter] = useState<string>(''); // '', '24h', '48h', '1week', '2weeks'
  const [showFilters, setShowFilters] = useState(false);
  const [filterModalMode, setFilterModalMode] = useState<'categories' | 'precise'>('categories');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [notificationPopup, setNotificationPopup] = useState({ show: false, message: '' });
  const [favoriteNotification, setFavoriteNotification] = useState({ show: false, message: '', isRemoved: false });
  const [initialOrder, setInitialOrder] = useState<Map<string, number>>(new Map());
  const [showAuthModal, setShowAuthModal] = useState(false);
  // null = încă nu am citit din localStorage; true = afișează banner; false = utilizatorul l-a închis, ține minte
  const [showBanner, setShowBanner] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedProductForFavorite, setSelectedProductForFavorite] = useState<{ id: string, title: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  /** null până la citirea breakpoint-ului Tailwind `md` (768px) — listare 24 vs 18. */
  const [viewportIsMdUp, setViewportIsMdUp] = useState<boolean | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  /** Rază km față de centrul intern; coordonatele rămân în state/localStorage, nu în URL-ul public. */
  const [locationRadiusKm, setLocationRadiusKm] = useState<number>(0);
  const [remoteLocationRadiusKm, setRemoteLocationRadiusKm] = useState<number>(0);
  const [nearLat, setNearLat] = useState<number | null>(() =>
    typeof initialListings?.resolvedCenter?.lat === "number" ? initialListings.resolvedCenter.lat : null,
  );
  const [nearLng, setNearLng] = useState<number | null>(() =>
    typeof initialListings?.resolvedCenter?.lng === "number" ? initialListings.resolvedCenter.lng : null,
  );
  const [resolvedListingCoordinates, setResolvedListingCoordinates] = useState<Record<string, { lat: number; lng: number }>>({});
  const listingCoordResolveRunRef = useRef(0);
  /** Query-uri geocode eșuate — nu reîncerca la infinit (blochează CPU/rețea). */
  const locationResolveFailedQueriesRef = useRef<Set<string>>(new Set());
  /** Centru GPS folosit fără oraș listă; blochează ștergerea în efectul de geocodare. */
  const [locationCenterFromGps, setLocationCenterFromGps] = useState(false);
  const [locationGeocodeBusy, setLocationGeocodeBusy] = useState(false);
  const [useMyLocationBusy, setUseMyLocationBusy] = useState(false);
  const [locationPermissionModalOpen, setLocationPermissionModalOpen] = useState(false);
  useEffect(() => {
    locationResolveFailedQueriesRef.current.clear();
  }, [nearLat, nearLng]);
  const [imageSearchProductIds, setImageSearchProductIds] = useState<string[] | null>(null);
  const [isImageSearching, setIsImageSearching] = useState(false);
  const [similarModelsSuggestions, setSimilarModelsSuggestions] = useState<Array<{ label: string; key: string }>>([]);
  const [similarModelsLoading, setSimilarModelsLoading] = useState(false);
  const [recoveryData, setRecoveryData] = useState<{
    alternatives: { phrase: string; source: "personal" | "global" }[];
    relaxations: { label: string; url: string }[];
  } | null>(null);
  const [mobileCategoryMultiSelectEnabled, setMobileCategoryMultiSelectEnabled] = useState(false);

  const closeMobileFiltersModal = useCallback(() => {
    setMobileCategoryMultiSelectEnabled(false);
    setShowFilters(false);
  }, []);

  const syncGpsCenterToUrl = useCallback(
    (publicLabel?: string) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      params.delete("locations");
      params.delete("city");
      params.delete("radiusKm");
      params.delete("nearLat");
      params.delete("nearLng");
      params.set("location", getPublicLocationLabel(publicLabel));
      router.replace(`/ro?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const applyStoredLocationCenter = useCallback((center: StoredLocationCenter) => {
    setLocationCenterFromGps(true);
    setSelectedLocations([]);
    setLocation("all");
    setNearLat(center.lat);
    setNearLng(center.lng);
    const publicLabel = center.publicLabel || getPublicLocationLabel(center.label);
    setLocationSearch(publicLabel);
    syncGpsCenterToUrl(publicLabel);
  }, [syncGpsCenterToUrl]);

  const applyMyLocationCenter = useCallback(
    (opts: { closeMobileSheet: boolean; automatic?: boolean }) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        return;
      }
      if (!opts.automatic) setUseMyLocationBusy(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocationCenterFromGps(true);
          setSelectedLocations([]);
          setLocation("all");
          setNearLat(lat);
          setNearLng(lng);
          const initialPublicLabel = "Locația mea";
          setLocationSearch(initialPublicLabel);
          setUseMyLocationBusy(false);
          syncGpsCenterToUrl(initialPublicLabel);
          try {
            saveStoredLocationCenter({ lat, lng, label: "Locația mea", publicLabel: initialPublicLabel, ts: Date.now() });
          } catch {
            /* ignore storage errors */
          }
          if (opts.closeMobileSheet) closeMobileFiltersModal();
          void (async () => {
            try {
              const res = await fetch(
                `/api/ro/resolve-location?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
              );
              const data = (await res.json()) as {
                ok?: boolean;
                formattedAddress?: string;
                addressComponents?: Array<{ longName?: string; shortName?: string; types?: string[] }>;
              };
              if (data.ok && typeof data.formattedAddress === "string" && data.formattedAddress.trim().length > 0) {
                const label = data.formattedAddress.trim();
                const publicLabel = getPublicLocationLabelFromComponents(data.addressComponents, label);
                setLocationSearch(publicLabel);
                syncGpsCenterToUrl(publicLabel);
                try {
                  saveStoredLocationCenter({ lat, lng, label, publicLabel, ts: Date.now() });
                } catch {
                  /* ignore storage errors */
                }
              }
            } catch {
              /* păstrăm „Locația mea” */
            }
          })();
        },
        () => {
          setUseMyLocationBusy(false);
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
      );
    },
    [closeMobileFiltersModal, syncGpsCenterToUrl],
  );

  const applyNationwideLocation = useCallback(
    (opts?: { closeMobileSheet?: boolean }) => {
      setLocationCenterFromGps(false);
      setNearLat(null);
      setNearLng(null);
      setLocation("all");
      setSelectedLocations([]);
      setLocationSearch("Toată România");
      setLocationRadiusKm(0);
      setRemoteLocationRadiusKm(0);
      clearStoredLocationCenter();

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.delete("location");
        params.delete("locations");
        params.delete("city");
        params.delete("radiusKm");
        params.delete("nearLat");
        params.delete("nearLng");
        const qs = params.toString();
        router.replace(qs ? `/ro?${qs}` : "/ro", { scroll: false });
      }

      if (opts?.closeMobileSheet) closeMobileFiltersModal();
    },
    [closeMobileFiltersModal, router],
  );

  const confirmLocationPermissionModal = useCallback(() => {
    markLocationPromptSeen();
    setLocationPermissionModalOpen(false);
    window.setTimeout(() => {
      applyMyLocationCenter({ closeMobileSheet: false });
    }, 180);
  }, [applyMyLocationCenter]);

  const handleLocationSearchChange = useCallback((value: string) => {
    const next = value.trim();
    setLocationSearch(value);
    setLocationCenterFromGps(false);
    if (!next) {
      setLocation("all");
      setSelectedLocations([]);
      setNearLat(null);
      setNearLng(null);
      return;
    }
    setLocation(next);
    setSelectedLocations([next]);
  }, []);

  // Bundle „MarketplaceFilters”: state UI-only pentru câmpurile noi (livrare/data publicării/free).
  const [marketplaceDatePosted, setMarketplaceDatePosted] = useState<MarketplaceDatePostedValue>("all");
  const [marketplaceDelivery, setMarketplaceDelivery] = useState<string[]>([]);
  const [marketplaceFreeOnly, setMarketplaceFreeOnly] = useState(false);
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);

  const applyMarketplaceCategoryFromSelect = useCallback((value: string) => {
    setSelectedCategories([]);
    setSelectedExecutariMainCategory("");
    setSelectedExecutariListCategory("");
    setSelectedExecutariListCategories([]);
    if (value === "all") {
      setSelectedCategory("all");
      setSelectedSubcategory("all");
      setSelectedSubcategories([]);
      setSelectedLevel3("all");
      setSelectedPieseTipSlugs([]);
      return;
    }
    setSelectedCategory(value);
    setSelectedSubcategory("all");
    setSelectedSubcategories([]);
    setSelectedLevel3("all");
    setSelectedPieseTipSlugs([]);
  }, []);

  const submitMarketplaceUrlSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    let q: string;
    if (selectedCategory === "all") {
      q = marketplaceSearchText.trim();
    } else {
      q = buildMarketplaceFineSearchQ(marketplaceSearchText, fineSearchLockedAutoBrand);
    }
    const params = new URLSearchParams(window.location.search);
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("page");
    params.delete("from");
    prefetchRoMarketplaceFirstPageRef.current(params);
    router.push(`/ro?${params.toString()}`);
  }, [marketplaceSearchText, selectedCategory, fineSearchLockedAutoBrand, router]);

  /** Scrie imediat `q` corect în URL (înainte de blur), ca să nu rămână prefixe parțiale din debounce (ex. „co”). */
  const flushRoMarketplaceSearchUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    if (roMarketplaceSearchUrlDebounceRef.current) {
      clearTimeout(roMarketplaceSearchUrlDebounceRef.current);
      roMarketplaceSearchUrlDebounceRef.current = null;
    }
    const params = new URLSearchParams(window.location.search);
    const urlQ = (params.get("q") ?? "").trim();
    let targetQ: string;
    if (selectedCategory === "all") {
      targetQ = marketplaceSearchText.trim();
    } else {
      targetQ = buildMarketplaceFineSearchQ(marketplaceSearchText, fineSearchLockedAutoBrand);
    }
    if (normalizeForSearch(targetQ) === normalizeForSearch(urlQ)) return;
    if (targetQ) params.set("q", targetQ);
    else params.delete("q");
    params.delete("page");
    params.delete("from");
    prefetchRoMarketplaceFirstPageRef.current(params);
    startRouteTransition(() => router.replace(`/ro?${params.toString()}`, { scroll: false }));
  }, [
    marketplaceSearchText,
    fineSearchLockedAutoBrand,
    selectedCategory,
    router,
    startRouteTransition,
  ]);

  /** Căutare marketplace: `q` în URL (toate categoriile = text direct; cu categorie = text + marcă din chip, ca la Search fin). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlQ = (searchParams?.get?.("q") ?? "").trim();
    let targetQ: string;
    if (selectedCategory === "all") {
      targetQ = marketplaceSearchText.trim();
    } else {
      targetQ = buildMarketplaceFineSearchQ(marketplaceSearchText, fineSearchLockedAutoBrand);
    }
    if (normalizeForSearch(targetQ) === normalizeForSearch(urlQ)) {
      if (roMarketplaceSearchUrlDebounceRef.current) {
        clearTimeout(roMarketplaceSearchUrlDebounceRef.current);
        roMarketplaceSearchUrlDebounceRef.current = null;
      }
      return;
    }
    if (roMarketplaceSearchUrlDebounceRef.current) clearTimeout(roMarketplaceSearchUrlDebounceRef.current);
    roMarketplaceSearchUrlDebounceRef.current = setTimeout(() => {
      roMarketplaceSearchUrlDebounceRef.current = null;
      const params = new URLSearchParams(window.location.search);
      if (targetQ) params.set("q", targetQ);
      else params.delete("q");
      params.delete("page");
      params.delete("from");
      prefetchRoMarketplaceFirstPageRef.current(params);
      startRouteTransition(() => router.replace(`/ro?${params.toString()}`, { scroll: false }));
    }, 160);
    return () => {
      if (roMarketplaceSearchUrlDebounceRef.current) {
        clearTimeout(roMarketplaceSearchUrlDebounceRef.current);
        roMarketplaceSearchUrlDebounceRef.current = null;
      }
    };
  }, [
    marketplaceSearchText,
    fineSearchLockedAutoBrand,
    selectedCategory,
    searchParams,
    searchParamsString,
    router,
    startRouteTransition,
  ]);

  /** Sincronizează câmpul unic de căutare cu `q` / `brand` din URL (inclusiv deep link și înapoi/înainte). */
  useEffect(() => {
    // În timpul tastării, debounce-ul poate scrie în URL un `q` parțial; dacă aplicăm înapoi în stare,
    // câmpul controlat se taie (ex. „conducta” → „co”). Nu suprascriem până la pierderea focusului (flush URL).
    if (marketplaceSearchFocused) return;

    const q = (searchParams?.get?.("q") ?? "").trim();
    const brandSingle = (searchParams?.get?.("brand") ?? "").trim();
    const brandsMulti = (searchParams?.get?.("brands") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const subForPiese =
      selectedSubcategories.length === 1 ? selectedSubcategories[0] : selectedSubcategory;

    if (selectedCategory === "all") {
      setMarketplaceSearchText(q);
      return;
    }

    let text = q;
    const hasUrlBrand = brandSingle && brandSingle.toLowerCase() !== "all";
    if (hasUrlBrand || brandsMulti.length > 0) {
      if (q) {
        text =
          stripBrandTokensFromSearchQuery(
            q,
            hasUrlBrand ? brandSingle : undefined,
            brandsMulti.length ? brandsMulti : undefined,
          ) ?? "";
      } else {
        // `brand` poate fi scris în URL înainte de `q` (debounce router.replace).
        // Nu suprascrie câmpul cu gol/stale: altfel pierzi restul („conducta”) sau un prefix în curs de tastare („con”).
        const keepRemainder =
          !!fineSearchLockedAutoBrand?.trim() ||
          selectedBrand !== "all" ||
          selectedBrands.length > 0;
        if (keepRemainder) return;
        text = "";
      }
    } else if (subForPiese === "piese-auto" && q) {
      const extracted = extractAutoBrandFromFineSearchText(q);
      if (extracted) {
        setFineSearchLockedAutoBrand((prev) => prev ?? extracted.fullBrand);
        setFineSearchLockedAutoSlug((prev) => prev ?? extracted.brandSlug);
        text = extracted.remainder;
      }
    }

    // Marca e deja în chip / filtru: nu o mai afișa repetat în câmp (evită „BMW BMW …”).
    const shouldStripChipBrand =
      !!fineSearchLockedAutoBrand?.trim() ||
      selectedBrand !== "all" ||
      selectedBrands.length > 0;
    if (shouldStripChipBrand && text.trim()) {
      const cleaned = stripBrandTokensFromSearchQuery(
        text,
        fineSearchLockedAutoBrand?.trim() ||
          (selectedBrand !== "all" ? selectedBrand : undefined),
        selectedBrands.length > 0 ? selectedBrands : undefined,
      );
      text = (cleaned ?? "").trim();
    }

    setMarketplaceSearchText(text.trim());
  }, [
    searchParamsString,
    selectedCategory,
    selectedSubcategory,
    selectedSubcategories,
    fineSearchLockedAutoBrand,
    selectedBrand,
    selectedBrands,
    marketplaceSearchFocused,
  ]);

  const handleMarketplaceSearchInputChange = useCallback(
    (value: string) => {
      if (selectedCategory !== "all" && !fineSearchLockedAutoSlug) {
        const extracted = extractAutoBrandFromFineSearchText(value);
        if (extracted) {
          setFineSearchLockedAutoBrand(extracted.fullBrand);
          setFineSearchLockedAutoSlug(extracted.brandSlug);
          setMarketplaceSearchText(extracted.remainder);
          return;
        }
      }
      setMarketplaceSearchText(value);
    },
    [fineSearchLockedAutoSlug, selectedCategory],
  );

  const clearFineSearchLockedBrand = useCallback(() => {
    setFineSearchLockedAutoBrand(null);
    setFineSearchLockedAutoSlug(null);
  }, []);

  /** × pe chip: scoate marca din Search fin și din filtrul Marca (dacă e setat). */
  const clearSearchFinBrandChip = useCallback(() => {
    setFineSearchLockedAutoBrand(null);
    setFineSearchLockedAutoSlug(null);
    setSelectedBrand('all');
    setSelectedBrands([]);
  }, []);

  const refreshSearchFinHintDismissed = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      const migrateLegacySessionToGuestLs = () => {
        try {
          if (localStorage.getItem(SEARCH_FIN_BRAND_HINT_GUEST_LS_KEY) === "1") return;
          if (sessionStorage.getItem(SEARCH_FIN_BRAND_HINT_LEGACY_SS_KEY) === "1") {
            localStorage.setItem(SEARCH_FIN_BRAND_HINT_GUEST_LS_KEY, "1");
            sessionStorage.removeItem(SEARCH_FIN_BRAND_HINT_LEGACY_SS_KEY);
          }
        } catch {
          /* ignore */
        }
      };
      migrateLegacySessionToGuestLs();

      const guestDismissed = localStorage.getItem(SEARCH_FIN_BRAND_HINT_GUEST_LS_KEY) === "1";
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (uid) {
        // Doar cheia contului — nu moșteni dismiss-ul guest al altcuiva de pe același browser.
        const userDismissed = localStorage.getItem(`${SEARCH_FIN_BRAND_HINT_LS_PREFIX}${uid}`) === "1";
        setSearchFinBrandHintDismissed(userDismissed);
      } else {
        setSearchFinBrandHintDismissed(guestDismissed);
      }
    } catch {
      setSearchFinBrandHintDismissed(false);
    }
  }, []);

  const handleSearchFinBrandHintOk = useCallback(async () => {
    setSearchFinBrandHintDismissed(true);
    if (typeof window === "undefined") return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      // Guest: o singură cheie pe browser (supraviețuiește închiderii tab-ului).
      localStorage.setItem(SEARCH_FIN_BRAND_HINT_GUEST_LS_KEY, "1");
      if (uid) {
        // User: cheie per cont; + guest ca după logout să nu reapară pe același browser.
        localStorage.setItem(`${SEARCH_FIN_BRAND_HINT_LS_PREFIX}${uid}`, "1");
      }
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  /** Evită level3 din altă subcategorie; la piese-auto curăță tipuri invalide din multi-select. */
  useEffect(() => {
    if (selectedSubcategory === 'all') return;
    const opts = filterSchema.level3BySubcategory[selectedSubcategory];
    if (selectedSubcategory === 'piese-auto') {
      if (!opts?.length) {
        setSelectedPieseTipSlugs([]);
        setSelectedLevel3('all');
        return;
      }
      setSelectedPieseTipSlugs((prev) => prev.filter((s) => opts.includes(s)));
      setSelectedLevel3('all');
      return;
    }
    setSelectedPieseTipSlugs([]);
    if (!opts?.length) {
      setSelectedLevel3((prev) => (prev === 'all' ? prev : 'all'));
      return;
    }
    setSelectedLevel3((prev) => (prev !== 'all' && !opts.includes(prev) ? 'all' : prev));
  }, [selectedSubcategory, filterSchema]);

  // Subcategorii și categorii efective (inclusiv pentru afișare filtre)
  const activeSelectedSubcategories = selectedSubcategories.length > 0
    ? selectedSubcategories
    : (selectedSubcategory !== 'all' ? [selectedSubcategory] : []);
  const activeSelectedCategories = selectedCategories.length > 0
    ? selectedCategories
    : (selectedCategory !== 'all' ? [selectedCategory] : []);
  const hasSelectedSubcategoryFilter = activeSelectedSubcategories.length > 0;
  const effectiveSelectedSubcategory =
    activeSelectedSubcategories.length === 1 ? activeSelectedSubcategories[0] : selectedSubcategory;
  const hasSelectedSizeFilter = selectedSizes.length > 0 || selectedSize !== 'all';
  const effectiveSelectedSize = selectedSizes.length === 1 ? selectedSizes[0] : selectedSize;
  const hasSelectedBrandFilter = selectedBrands.length > 0 || selectedBrand !== 'all';
  /** Afișare chip verde Search fin: marcă din Search fin sau din filtrul Marca */
  const searchFinBrandChipDisplay = useMemo(() => {
    if (fineSearchLockedAutoBrand?.trim()) return fineSearchLockedAutoBrand.trim();
    if (!hasSelectedBrandFilter) return null;
    if (selectedBrands.length > 1) return selectedBrands.join(', ');
    if (selectedBrands.length === 1) return selectedBrands[0];
    if (selectedBrand !== 'all') return selectedBrand;
    return null;
  }, [fineSearchLockedAutoBrand, hasSelectedBrandFilter, selectedBrands, selectedBrand]);
  const showSearchFinBrandChip = searchFinBrandChipDisplay != null;
  const effectiveSelectedBrand = selectedBrands.length === 1 ? selectedBrands[0] : selectedBrand;
  const hasSelectedModelFilter = selectedModels.length > 0 || selectedModel !== 'all';
  const effectiveSelectedModel = selectedModels.length === 1 ? selectedModels[0] : selectedModel;
  const hasSelectedColorFilter = selectedSubcategory !== 'piese-auto' && (selectedColors.length > 0 || selectedColor !== 'all');
  const effectiveSelectedColor = selectedColors.length === 1 ? selectedColors[0] : selectedColor;
  const hasSelectedLocationFilter = selectedLocations.length > 0 || location !== 'all';
  const effectiveSelectedLocation = selectedLocations.length === 1 ? selectedLocations[0] : location;
  const hasSelectedPieseTipFilter = effectiveSelectedSubcategory === 'piese-auto' && selectedPieseTipSlugs.length > 0;
  /** Un singur „filtru level3” în UI: piese = multi tip, altfel = selectedLevel3. */
  const hasAnyLevel3Filter =
    (effectiveSelectedSubcategory === 'piese-auto' && selectedPieseTipSlugs.length > 0) ||
    (effectiveSelectedSubcategory !== 'piese-auto' && selectedLevel3 !== 'all');
  const hasSelectedConditionFilter = selectedConditions.length > 0 || condition !== 'all';
  const effectiveSelectedCondition = selectedConditions.length === 1 ? selectedConditions[0] : condition;
  const hasSelectedSellerKindFilter = selectedSellerKinds.length === 1;
  const activeSelectedExecutariListCategories = selectedExecutariListCategories.length > 0
    ? selectedExecutariListCategories
    : (selectedExecutariListCategory ? [selectedExecutariListCategory] : []);
  const hasSelectedExecutariListCategoryFilter = activeSelectedExecutariListCategories.length > 0;
  const filteredLocationOptions = useMemo(() => {
    const q = normalizeForSearch(locationSearch);
    if (!q) return ROMANIAN_CITIES.slice(0, 120);
    return ROMANIAN_CITIES
      .filter((city) => normalizeForSearch(city).includes(q))
      .slice(0, 120);
  }, [locationSearch]);

  const filteredPieseTipSlugs = useMemo(() => {
    const slugs = filterSchema.level3BySubcategory['piese-auto'] ?? [];
    const q = normalizeForSearch(tipPiesaSearch);
    if (!q) return slugs;
    return slugs.filter((slug) => {
      const label = filterSchema.level3LabelsBySubcategory?.['piese-auto']?.[slug] ?? slug;
      return normalizeForSearch(label).includes(q) || normalizeForSearch(slug).includes(q);
    });
  }, [filterSchema, tipPiesaSearch]);

  const filteredBrandOptions = useMemo(() => {
    if (effectiveSelectedSubcategory === 'all') return [];
    const opts = getBrandOptionsForSubcategory(effectiveSelectedSubcategory);
    const q = normalizeForSearch(brandSearch);
    if (!q) return opts;
    return opts.filter((b) => normalizeForSearch(b).includes(q));
  }, [effectiveSelectedSubcategory, brandSearch]);

  /** Placeholder dinamic după categorie / subcategorie; la piese-auto fără marcă în filtre: exemplu cu brand. */
  const fineSearchPlaceholderFullText = useMemo(() => {
    const cat = selectedCategory;
    const sub = effectiveSelectedSubcategory;
    const subLabel =
      sub !== 'all' ? (filterSchema.subcategoryNames[sub] ?? sub) : '';
    const catEntry = cat !== 'all' ? (categories as Record<string, { name: string; subcategories: string[] }>)[cat] : null;
    const catName = catEntry?.name ?? '';

    if (sub === 'piese-auto') {
      if (!hasSelectedBrandFilter && !fineSearchLockedAutoBrand) {
        return 'Ex.: conducta bmw — piesă și marcă în aceeași frază';
      }
      return 'Ex.: grilă față, amortizoare…';
    }

    if (cat === 'imobiliare') {
      const im: Record<string, string> = {
        apartamente: 'Ex.: 3 camere Floreasca etaj 3',
        'case-vile': 'Ex.: curte 500 mp P+1 garaj',
        'terenuri-intravilane': 'Ex.: 1000 mp intravilan',
        'terenuri-agricole': 'Ex.: teren agricol Sud',
        'terenuri-extravilane': 'Ex.: extravilan suprafață…',
        'spatii-comerciale': 'Ex.: vitrină centru comercial',
        'hale-industriale': 'Ex.: hală 400 mp acces TIR',
        'proprietati-turistice': 'Ex.: pensiune 8 camere',
      };
      if (sub !== 'all' && im[sub]) return im[sub];
      if (subLabel) return `Caută în ${subLabel.toLowerCase()} — zonă, mp, camere…`;
      return 'Ex.: zonă, camere, suprafață…';
    }

    if (cat === 'autovehicule') {
      const au: Record<string, string> = {
        autoturisme: 'Ex.: Dacia Logan 2020 diesel',
        'suv-4x4': 'Ex.: Q5 2.0 TDI quattro 2018',
        motociclete: 'Ex.: Honda 750 cm cubi',
        camioane: 'Ex.: Iveco basculantă',
        remorci: 'Ex.: remorcă 3,5 t',
        autorulote: 'Ex.: autorulotă 6 locuri',
        'vehicule-electrice': 'Ex.: Tesla Model 3 2021',
      };
      if (sub !== 'all' && au[sub]) return au[sub];
      return subLabel
        ? `Caută în ${subLabel.toLowerCase()} — model, an, km…`
        : 'Ex.: model, an, combustibil…';
    }

    if (cat === 'utilaje') {
      if (subLabel) {
        return `Caută în ${subLabel.toLowerCase()} — oră, putere, stare…`;
      }
      return 'Ex.: utilaj, producător, an, localitate…';
    }

    if (cat === 'electronice') {
      const el: Record<string, string> = {
        'laptopuri-pc': 'Ex.: MacBook M2 16 GB 512',
        telefoane: 'Ex.: iPhone 15 Pro 256',
        tablete: 'Ex.: iPad Pro 12 inch',
        'tv-audio': 'Ex.: OLED 55" 4K',
        'console-jocuri': 'Ex.: PlayStation 5',
        'drone-gadgeturi': 'Ex.: dronă 4K GPS',
        'echipamente-foto': 'Ex.: Canon R6 obiectiv 24-70',
      };
      if (sub !== 'all' && el[sub]) return el[sub];
      return subLabel
        ? `Caută în ${subLabel.toLowerCase()} — model, stocare, stare…`
        : 'Ex.: model, generație, accesorii…';
    }

    if (cat === 'moda') {
      const mo: Record<string, string> = {
        'haine-designer': 'Ex.: jachetă mărime M neagră',
        incaltaminte: 'Ex.: mărime 42 piele',
        'genti-accesorii': 'Ex.: geantă piele maro',
        'parfumuri-cosmetice': 'Ex.: set parfum 100 ml',
        'ceasuri-lux': 'Ex.: automatik bicolor',
      };
      if (sub !== 'all' && mo[sub]) return mo[sub];
      return subLabel
        ? `Caută în ${subLabel.toLowerCase()} — mărime, culoare, brand…`
        : 'Ex.: mărime, culoare, sezon…';
    }

    if (cat === 'executari') {
      const ex: Record<string, string> = {
        'oferte-grupate': 'Ex.: pachet active, datorie, localitate…',
        'utilaje-echipamente': 'Ex.: licitație utilaj, județ…',
        'exec-imobiliare': 'Ex.: apartament, executare, preț…',
        'exec-autovehicule': 'Ex.: autoturism, km, evaluare…',
        'exec-industrial': 'Ex.: linie producție, licitație…',
        'exec-afaceri': 'Ex.: firmă, active, cifră…',
        'exec-office': 'Ex.: birou, suprafață, licitație…',
        'exec-altele': 'Ex.: număr dosar, localitate…',
      };
      if (sub !== 'all' && ex[sub]) return ex[sub];
      return 'Ex.: licitație, localitate, preț…';
    }

    if (catName && subLabel) {
      return `Caută în ${catName.toLowerCase()} · ${subLabel.toLowerCase()}…`;
    }
    if (catName) {
      return `Caută în ${catName.toLowerCase()}…`;
    }
    return 'Filtrare în rezultatele afișate…';
  }, [
    selectedCategory,
    effectiveSelectedSubcategory,
    hasSelectedBrandFilter,
    fineSearchLockedAutoBrand,
    categories,
    filterSchema,
  ]);

  /** Linie pentru placeholder animat Search fin (atenție + exempl din categorie, scurtat dacă e lung). */
  const fineSearchAnimatedPlaceholderLine = useMemo(() => {
    const ex = fineSearchPlaceholderFullText;
    const short = ex.length > 52 ? `${ex.slice(0, 49)}…` : ex;
    return `Scrie aici — ${short}`;
  }, [fineSearchPlaceholderFullText]);

  useEffect(() => {
    if (
      !mounted ||
      selectedCategory !== 'all' ||
      marketplaceSearchText.trim() !== '' ||
      marketplaceSearchFocused
    ) {
      setQuickSearchTypewriter('');
      return;
    }
    const LINE = RO_MARKETPLACE_SEARCH_ANIMATED_LINE;
    let step = 0;
    const typingLen = LINE.length;
    const pauseSteps = 55;
    const clearSteps = 12;
    const total = typingLen + pauseSteps + clearSteps;
    const id = setInterval(() => {
      step = (step + 1) % total;
      if (step < typingLen) {
        setQuickSearchTypewriter(LINE.slice(0, step + 1));
      } else if (step < typingLen + pauseSteps) {
        setQuickSearchTypewriter(LINE);
      } else {
        setQuickSearchTypewriter('');
      }
    }, 40);
    return () => clearInterval(id);
  }, [mounted, selectedCategory, marketplaceSearchText, marketplaceSearchFocused]);

  useEffect(() => {
    if (
      !mounted ||
      selectedCategory === 'all' ||
      marketplaceSearchText.trim() !== '' ||
      marketplaceSearchFocused
    ) {
      setFineSearchTypewriter('');
      return;
    }
    const LINE = fineSearchAnimatedPlaceholderLine;
    let step = 0;
    const typingLen = LINE.length;
    const pauseSteps = 55;
    const clearSteps = 12;
    const total = typingLen + pauseSteps + clearSteps;
    const id = setInterval(() => {
      step = (step + 1) % total;
      if (step < typingLen) {
        setFineSearchTypewriter(LINE.slice(0, step + 1));
      } else if (step < typingLen + pauseSteps) {
        setFineSearchTypewriter(LINE);
      } else {
        setFineSearchTypewriter('');
      }
    }, 38);
    return () => clearInterval(id);
  }, [mounted, selectedCategory, marketplaceSearchText, fineSearchAnimatedPlaceholderLine, marketplaceSearchFocused]);

  useEffect(() => {
    const q = marketplaceSearchText.trim();
    if (!q) {
      setFineSearchIconBusy(false);
      return;
    }
    setFineSearchIconBusy(true);
    const t = setTimeout(() => setFineSearchIconBusy(false), 450);
    return () => clearTimeout(t);
  }, [marketplaceSearchText]);

  useEffect(() => {
    const prev = prevSelectedCategoryForSearchRef.current;
    prevSelectedCategoryForSearchRef.current = selectedCategory;
    if (selectedCategory === "all" && prev != null && prev !== "all") {
      setFineSearchLockedAutoBrand(null);
      setFineSearchLockedAutoSlug(null);
      setSearchFinHelpOpen(false);
      setMarketplaceSearchText((searchParams?.get?.("q") ?? "").trim());
    }
  }, [selectedCategory, searchParams]);

  useEffect(() => {
    if (!searchFinHelpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchFinHelpOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchFinHelpOpen]);

  const modelOptionsForSelectedBrands = useMemo(() => {
    if (effectiveSelectedSubcategory === 'all') return [] as string[];
    const brandKeys = selectedBrands.length > 0
      ? selectedBrands
      : (effectiveSelectedBrand !== 'all' ? [effectiveSelectedBrand] : []);
    if (brandKeys.length === 0) return [] as string[];
    const allModels = brandKeys.flatMap((b) => getModelsForBrand(b, effectiveSelectedSubcategory));
    return Array.from(new Set(allModels)).sort((a, b) => a.localeCompare(b));
  }, [selectedBrands, effectiveSelectedBrand, effectiveSelectedSubcategory]);

  /** Piese auto: marca din Search fin (chip) → același filtru „Marca” + URL `brand`, ca să îngusteze query-ul API, nu doar filtrarea locală. */
  useEffect(() => {
    if (!mounted) return;
    if (effectiveSelectedSubcategory !== "piese-auto") return;
    const label = fineSearchLockedAutoBrand?.trim();
    if (!label) return;
    const opts = getBrandOptionsForSubcategory("piese-auto");
    const matched = matchExtractedMarcaToBrandOption(label, opts);
    if (!matched) return;
    if (selectedBrands.length === 1 && selectedBrands[0] === matched) return;
    if (selectedBrands.length === 0 && selectedBrand === matched) return;
    setSelectedBrand(matched);
    setSelectedBrands([matched]);
    setSelectedModel("all");
    setSelectedModels([]);
  }, [
    mounted,
    effectiveSelectedSubcategory,
    fineSearchLockedAutoBrand,
    selectedBrand,
    selectedBrands,
  ]);

  // Sugestii standard populare de categorii și subcategorii
  const popularSearchSuggestions = [
    'Autoturisme',
    'Apartamente',
    'Piese auto',
    'Terenuri',
    'iPhone',
    'Samsung',
    'Laptop',
    'Bijuterii',
    'Utilaje construcții',
    'Case și vile',
    'SUV',
    'Motociclete',
    'TV',
    'Tablouri',
    'Ceasuri',
    'Mobilier'
  ];

  // Detailed filters for specific subcategories
  const [detailedFilters, setDetailedFilters] = useState({
    // Imobiliare - Apartamente
    rooms: '',
    surface: { min: '', max: '' },
    floor: { min: '', max: '' },
    buildingYear: { min: '', max: '' },
    city: '',
    county: '',
    country: 'România',

    // Imobiliare - Case și vile
    landSurface: { min: '', max: '' },
    garden: false,
    garage: false,
    pool: false,

    // Imobiliare - Terenuri
    terrainType: '',
    utilities: [],
    zoning: '',

    // Autovehicule + Piese auto
    brand: '',
    model: '',
    year: { min: '', max: '' },
    mileage: { min: '', max: '' },
    capacitateCilindrica: { min: '', max: '' },
    fuelType: '',
    transmission: '',
    color: '',

    // Executări silite
    executionType: '',
    court: '',
    debtor: '',
    executionValue: { min: '', max: '' }
  });

  type DetailedFiltersState = {
    rooms: string; surface: { min: string; max: string }; floor: { min: string; max: string }; buildingYear: { min: string; max: string };
    landSurface: { min: string; max: string }; garden: boolean; garage: boolean; pool: boolean; terrainType: string;
    year: { min: string; max: string }; mileage: { min: string; max: string }; capacitateCilindrica?: { min: string; max: string }; fuelType: string; transmission: string;
    executionType: string; court: string; debtor: string; executionValue: { min: string; max: string };
  };
  const syncAllFiltersToUrl = useCallback((state: {
    listingsScope?: 'all' | 'live_bid' | 'executari';
    includeExecutariCrosslist?: boolean;
    selectedCategory: string; selectedSubcategory: string;
    selectedCategories?: string[];
    selectedSubcategories?: string[];
    selectedExecutariMainCategory?: string; selectedExecutariListCategory?: string; selectedExecutariListCategories?: string[];
    selectedLevel3: string;
    selectedPieseTipSlugs?: string[];
    selectedSize: string; selectedBrand: string; selectedModel: string; selectedColor: string;
    selectedSizes?: string[]; selectedBrands?: string[]; selectedModels?: string[]; selectedColors?: string[];
    priceRange: { min: string; max: string }; location: string; condition: string;
    selectedLocations?: string[]; selectedConditions?: string[];
    imageFilter?: 'all' | 'with';
    selectedSellerKinds?: Array<'particular' | 'companie'>;
    detailedFilters: DetailedFiltersState;
    selectedCurrency: string;
    sortBy?: string;
    marketplaceFreeOnly?: boolean;
  }, opts?: { clearSearchQuery?: boolean }) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (opts?.clearSearchQuery) {
      params.delete('q');
    }
    const set = (k: string, v: string) => { if (v && v !== 'all') params.set(k, v); else params.delete(k); };
    const scopeVal = state.listingsScope ?? listingsScope;
    set('scope', scopeVal === 'live_bid' || scopeVal === 'executari' ? scopeVal : '');
    const includeExec = state.includeExecutariCrosslist ?? includeExecutariCrosslist;
    if (includeExec) params.set('includeExecutari', '1');
    else params.delete('includeExecutari');
    set('category', state.selectedCategory);
    const rawMultiCategories = Array.isArray(state.selectedCategories) ? state.selectedCategories : selectedCategories;
    const multiCategories = rawMultiCategories.filter((c) => c && c !== 'all');
    if (multiCategories.length > 1) {
      params.set('categories', multiCategories.join(','));
      params.delete('category');
      params.delete('subcategory');
      params.delete('subcategories');
      params.delete('level3');
      params.delete('level3s');
      params.delete('execMain');
      params.delete('execCat');
    } else if (multiCategories.length === 1) {
      params.set('category', multiCategories[0]);
      params.delete('categories');
    } else {
      params.delete('categories');
    }
    const rawMultiSubcategories = Array.isArray(state.selectedSubcategories) ? state.selectedSubcategories : selectedSubcategories;
    const multiSubcategories = rawMultiSubcategories.filter((s) => s && s !== 'all');
    if (multiSubcategories.length > 1) {
      params.set('subcategories', multiSubcategories.join(','));
      params.delete('subcategory');
    } else if (multiSubcategories.length === 1) {
      params.set('subcategory', multiSubcategories[0]);
      params.delete('subcategories');
    } else {
      params.delete('subcategories');
      set('subcategory', state.selectedSubcategory);
    }
    if (state.selectedCategory === 'executari') {
      const execMain = state.selectedExecutariMainCategory || '';
      const execCats = Array.isArray(state.selectedExecutariListCategories)
        ? state.selectedExecutariListCategories.filter((v) => !!v)
        : (selectedExecutariListCategories.length > 0
          ? selectedExecutariListCategories
          : (state.selectedExecutariListCategory ? [state.selectedExecutariListCategory] : []));
      set('execMain', execMain);
      if (execCats.length > 1) {
        params.set('execCats', execCats.join(','));
        params.delete('execCat');
      } else if (execCats.length === 1) {
        params.set('execCat', execCats[0]);
        params.delete('execCats');
      } else {
        params.delete('execCat');
        params.delete('execCats');
      }
    } else {
      params.delete('execMain');
      params.delete('execCat');
      params.delete('execCats');
    }
    const subForL3 =
      state.selectedSubcategory === 'piese-auto' ||
      (Array.isArray(state.selectedSubcategories) &&
        state.selectedSubcategories.length === 1 &&
        state.selectedSubcategories[0] === 'piese-auto');
    const pieseTips = (state.selectedPieseTipSlugs ?? selectedPieseTipSlugs).filter((s) => s && s !== 'all');
    if (subForL3) {
      params.delete('level3');
      params.delete('level3s');
      if (pieseTips.length > 1) {
        params.set('level3s', pieseTips.join(','));
      } else if (pieseTips.length === 1) {
        params.set('level3', pieseTips[0]);
      }
    } else {
      params.delete('level3s');
      set('level3', state.selectedLevel3);
    }
    const setMulti = (singularKey: string, pluralKey: string, singularValue: string, values?: string[]) => {
      const arr = Array.isArray(values) ? values.filter((v) => v && v !== 'all') : [];
      if (arr.length > 1) {
        params.set(pluralKey, arr.join(','));
        params.delete(singularKey);
      } else if (arr.length === 1) {
        params.set(singularKey, arr[0]);
        params.delete(pluralKey);
      } else {
        params.delete(pluralKey);
        set(singularKey, singularValue);
      }
    };
    setMulti('size', 'sizes', state.selectedSize, state.selectedSizes ?? selectedSizes);
    setMulti('brand', 'brands', state.selectedBrand, state.selectedBrands ?? selectedBrands);
    setMulti('model', 'models', state.selectedModel, state.selectedModels ?? selectedModels);
    setMulti('color', 'colors', state.selectedColor, state.selectedColors ?? selectedColors);
    set('priceMin', state.priceRange.min);
    set('priceMax', state.priceRange.max);
    setMulti('location', 'locations', state.location, state.selectedLocations ?? selectedLocations);
    const locSingle = params.get("location");
    if (locSingle?.trim()) params.set("city", locSingle.trim());
    else params.delete("city");
    /**
     * Persist resolved coordinates in URL (4 decimals ≈ 11 m precision) so that:
     *   - SSR can serve the same indexed-radius result on first paint
     *   - `unstable_cache` / Upstash KV keys match across users with the same lat/lng/radius
     *   - back/forward navigation restores the geo center without a 450ms re-geocode
     * Previously these were always deleted, forcing every refetch to re-resolve.
     */
    const hasResolvedGeo =
      nearLat != null &&
      nearLng != null &&
      Number.isFinite(nearLat) &&
      Number.isFinite(nearLng);
    if (hasResolvedGeo) {
      params.set("nearLat", String(Number(nearLat!.toFixed(3))));
      params.set("nearLng", String(Number(nearLng!.toFixed(3))));
    } else {
      params.delete("nearLat");
      params.delete("nearLng");
    }
    if (locationCenterFromGps) {
      params.set("location", getPublicLocationLabel(locationSearch));
      params.delete("locations");
      params.delete("city");
      // GPS uses radius from state set elsewhere (clampRoRadiusKmForApi); do not duplicate here.
      params.delete("radiusKm");
    } else if (locationRadiusKm > 0 && hasResolvedGeo) {
      params.set("radiusKm", String(Math.min(500, Math.max(1, Math.round(locationRadiusKm)))));
    } else {
      params.delete("radiusKm");
    }
    setMulti('condition', 'conditions', state.condition, state.selectedConditions ?? selectedConditions);
    const imagesMode = state.imageFilter ?? imageFilter;
    if (imagesMode === 'with') params.set('images', imagesMode);
    else params.delete('images');
    const sk = state.selectedSellerKinds ?? selectedSellerKinds;
    if (sk.length === 1) params.set('vanzator', sk[0]);
    else params.delete('vanzator');
    set('currency', state.selectedCurrency.toLowerCase());
    const mf = state.marketplaceFreeOnly ?? marketplaceFreeOnly;
    if (mf) params.set('freeOnly', '1');
    else params.delete('freeOnly');
    if (state.sortBy && state.sortBy !== 'relevant') params.set('sort', state.sortBy);
    else params.delete('sort');
    const df = state.detailedFilters;
    set('rooms', df.rooms);
    set('surfaceMin', df.surface.min);
    set('surfaceMax', df.surface.max);
    set('floorMin', df.floor.min);
    set('floorMax', df.floor.max);
    set('buildingYearMin', df.buildingYear.min);
    set('buildingYearMax', df.buildingYear.max);
    set('landSurfaceMin', df.landSurface.min);
    set('landSurfaceMax', df.landSurface.max);
    if (df.garden) params.set('garden', '1'); else params.delete('garden');
    if (df.garage) params.set('garage', '1'); else params.delete('garage');
    if (df.pool) params.set('pool', '1'); else params.delete('pool');
    set('terrainType', df.terrainType);
    set('yearMin', df.year.min);
    set('yearMax', df.year.max);
    set('mileageMin', df.mileage.min);
    set('mileageMax', df.mileage.max);
    if (df.capacitateCilindrica) {
      set('capMin', df.capacitateCilindrica.min);
      set('capMax', df.capacitateCilindrica.max);
    } else {
      params.delete('capMin');
      params.delete('capMax');
    }
    set('fuelType', df.fuelType);
    set('transmission', df.transmission);
    set('executionType', df.executionType);
    set('court', df.court);
    set('debtor', df.debtor);
    set('executionValueMin', df.executionValue.min);
    set('executionValueMax', df.executionValue.max);
    const currentParams = new URLSearchParams(window.location.search);
    const currentFiltersOnly = new URLSearchParams(currentParams.toString());
    currentFiltersOnly.delete("page");
    currentFiltersOnly.delete("from");

    const nextFiltersOnly = new URLSearchParams(params.toString());
    nextFiltersOnly.delete("page");
    nextFiltersOnly.delete("from");

    const nextFiltersStr = nextFiltersOnly.toString();
    const currentFiltersStr = currentFiltersOnly.toString();
    if (nextFiltersStr !== currentFiltersStr) {
      /** Nu folosi `nextFiltersStr` la replace: ar șterge `page` / `from` din URL (pagina 3 → 1 la revenire). */
      const mergePaginationIfLost = (target: URLSearchParams) => {
        const liveRead = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
        const lp = liveRead.get("page");
        if (lp != null && String(lp).trim() !== "" && !target.has("page")) target.set("page", String(lp).trim());
        const lf = liveRead.get("from");
        if (lf != null && String(lf).trim() !== "" && !target.has("from")) target.set("from", String(lf).trim());
        const lc = liveRead.get("cursor");
        if (lc != null && String(lc).trim() !== "" && !target.has("cursor")) target.set("cursor", String(lc).trim());
      };
      mergePaginationIfLost(params);
      const fullQs = params.toString();
      startRouteTransition(() => {
        const finalParams = new URLSearchParams(fullQs);
        mergePaginationIfLost(finalParams);
        const q = finalParams.toString();
        router.replace(q ? `/ro?${q}` : "/ro", { scroll: false });
      });
    }
  }, [router, startRouteTransition, selectedCategories, selectedSubcategories, selectedExecutariListCategory, selectedExecutariListCategories, selectedSizes, selectedBrands, selectedModels, selectedColors, selectedLocations, selectedConditions, imageFilter, selectedSellerKinds, selectedPieseTipSlugs, selectedLevel3, includeExecutariCrosslist, locationRadiusKm, nearLat, nearLng, locationCenterFromGps, locationSearch, marketplaceFreeOnly]);

  const syncSubcategoriesToUrl = useCallback((nextSubcategories: string[]) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const clean = Array.from(new Set(nextSubcategories.filter((s) => s && s !== 'all')));

    if (clean.length > 1) {
      params.set('subcategories', clean.join(','));
      params.delete('subcategory');
    } else if (clean.length === 1) {
      params.set('subcategory', clean[0]);
      params.delete('subcategories');
    } else {
      params.delete('subcategory');
      params.delete('subcategories');
      params.delete('level3');
      params.delete('level3s');
    }
    params.delete("page");
    params.delete("from");

    const nextStr = params.toString();
    const currentStr = new URLSearchParams(window.location.search).toString();
    if (nextStr !== currentStr) {
      startRouteTransition(() => {
        router.replace(`/ro?${nextStr}`, { scroll: false });
      });
    }
  }, [router, startRouteTransition]);

  const applyMobileSubcategoriesChange = useCallback(
    (deduped: string[]) => {
      const clean = Array.from(new Set(deduped.filter((s) => s && s !== 'all')));
      setSelectedSubcategories(clean);
      setSelectedSubcategory(clean.length === 1 ? clean[0] : 'all');
      setSelectedLevel3('all');
      syncSubcategoriesToUrl(clean);
      setSelectedSize('all');
      setSelectedSizes([]);
      setSelectedBrand('all');
      setSelectedBrands([]);
      setSelectedModel('all');
      setSelectedModels([]);
      setSelectedColor('all');
      setSelectedColors([]);
    },
    [syncSubcategoriesToUrl],
  );

  const mobileFilterSubcategoryOptions = useMemo((): { value: string; label: string }[] => {
    if (selectedCategory === 'all' || !selectedCategory) return [];
    const entry = categories[selectedCategory as keyof typeof categories];
    const subs = entry?.subcategories;
    if (!subs?.length) return [];
    return subs.map((slug) => ({
      value: slug,
      label: String((subcategoryNames as Record<string, string>)[slug] ?? slug),
    }));
  }, [selectedCategory, categories, subcategoryNames]);

  useEffect(() => {
    if (!mounted) return;
    if (typeof window === 'undefined') return;
    const urlCategoryParam = (searchParams?.get?.("category") ?? "").trim();
    // Fără `categoryKey !== 'all'`: pentru text generic (ex. „usa”) analiza întoarce adesea categoryKey=all,
    // dar utilizatorul are deja categorie în filtre → catOverrode devine true → clearSearchQuery șterge ?q=
    // în timp ce Search fin îl repune → buclă RSC. Ștergem q doar când q sugerează explicit altă categorie.
    const catOverrode = !!(
      searchQ &&
      searchAnalysis?.categoryKey &&
      searchAnalysis.categoryKey !== "all" &&
      selectedCategory !== searchAnalysis.categoryKey
    );
    const subOverrode = !!(searchQ && (
      (selectedSubcategories.length > 1) ||
      (searchAnalysis?.subcategoryKey &&
        searchAnalysis.subcategoryKey !== "all" &&
        selectedSubcategory !== searchAnalysis.subcategoryKey)
    ));
    // Cât timp există deja ?category= în URL (marketplace filtrat), NU ștergem niciodată ?q= din sync-ul de filtre:
    // analiza subcategoriei poate „clipi” altfel decât state-ul (ex. „BMW usa față”) → subOverrode fals-pozitiv
    // → buclă cu Search fin + RSC + imagini NS_BINDING_ABORTED / ORB în Firefox.
    const userOverrodeSearch = !urlCategoryParam && (catOverrode || subOverrode);
    if (urlSyncDebounceTimerRef.current) {
      clearTimeout(urlSyncDebounceTimerRef.current);
    }
    urlSyncDebounceTimerRef.current = setTimeout(() => {
      syncAllFiltersToUrl({
        listingsScope, includeExecutariCrosslist, selectedCategory, selectedSubcategory, selectedCategories, selectedSubcategories, selectedExecutariMainCategory, selectedExecutariListCategory, selectedExecutariListCategories, selectedLevel3,
        selectedPieseTipSlugs,
        selectedSize, selectedBrand, selectedModel, selectedColor,
        selectedSizes, selectedBrands, selectedModels, selectedColors,
        priceRange, location, condition, selectedLocations, selectedConditions, imageFilter, selectedSellerKinds, detailedFilters, selectedCurrency,
        sortBy,
        marketplaceFreeOnly,
      }, { clearSearchQuery: userOverrodeSearch });
      urlSyncDebounceTimerRef.current = null;
    }, 250);
    return () => {
      if (urlSyncDebounceTimerRef.current) {
        clearTimeout(urlSyncDebounceTimerRef.current);
        urlSyncDebounceTimerRef.current = null;
      }
    };
  }, [listingsScope, includeExecutariCrosslist, selectedCategory, selectedSubcategory, selectedCategories, selectedSubcategories, selectedExecutariMainCategory, selectedExecutariListCategory, selectedExecutariListCategories, selectedLevel3, selectedPieseTipSlugs, selectedSize, selectedBrand, selectedModel, selectedColor, selectedSizes, selectedBrands, selectedModels, selectedColors, priceRange, location, condition, selectedLocations, selectedConditions, imageFilter, selectedSellerKinds, detailedFilters, selectedCurrency, sortBy, marketplaceFreeOnly, syncAllFiltersToUrl, mounted, searchQ, searchAnalysis?.categoryKey, searchAnalysis?.subcategoryKey, locationRadiusKm, nearLat, nearLng, searchParamsString]);

  const locationGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Debounce geocode mai scurt = mai puțin timp în «fără coordonate» și mai puține cereri duplicate. */
  const LOCATION_GEOCODE_DEBOUNCE_MS = 220;
  useEffect(() => {
    const singleLabel =
      selectedLocations.length === 1
        ? selectedLocations[0]
        : selectedLocations.length === 0 && location && location !== "all"
          ? location
          : null;
    if (selectedLocations.length > 1) {
      setLocationCenterFromGps(false);
      setNearLat(null);
      setNearLng(null);
      setLocationGeocodeBusy(false);
      return;
    }
    if (!singleLabel?.trim()) {
      if (locationCenterFromGps) {
        return;
      }
      setNearLat(null);
      setNearLng(null);
      setLocationGeocodeBusy(false);
      return;
    }
    setLocationGeocodeBusy(true);
    setLocationCenterFromGps(false);
    if (locationGeocodeTimerRef.current) clearTimeout(locationGeocodeTimerRef.current);
    locationGeocodeTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/ro/resolve-location?q=${encodeURIComponent(stripMetropolitanZoneFromLocationQuery(singleLabel.trim()))}`,
          );
          const data = (await res.json()) as {
            ok?: boolean;
            lat?: number;
            lng?: number;
            formattedAddress?: string;
            addressComponents?: Array<{ longName?: string; shortName?: string; types?: string[] }>;
          };
          if (data.ok && typeof data.lat === "number" && typeof data.lng === "number") {
            setNearLat(data.lat);
            setNearLng(data.lng);
            const publicLabel = getPublicLocationLabelFromComponents(data.addressComponents, data.formattedAddress || singleLabel);
            saveStoredLocationCenter({
              lat: data.lat,
              lng: data.lng,
              label: publicLabel,
              publicLabel,
              ts: Date.now(),
            });
            if (typeof window !== "undefined") {
              startRouteTransition(() => {
                const params = new URLSearchParams(window.location.search);
                params.set("nearLat", String(Number(data.lat!.toFixed(3))));
                params.set("nearLng", String(Number(data.lng!.toFixed(3))));
                router.replace(`/ro?${params.toString()}`, { scroll: false });
              });
            }
          } else {
            setNearLat(null);
            setNearLng(null);
          }
        } catch {
          setNearLat(null);
          setNearLng(null);
        } finally {
          setLocationGeocodeBusy(false);
        }
      })();
    }, LOCATION_GEOCODE_DEBOUNCE_MS);
    return () => {
      if (locationGeocodeTimerRef.current) clearTimeout(locationGeocodeTimerRef.current);
    };
  }, [selectedLocations, location, locationCenterFromGps, router, startRouteTransition]);

  // Search orchestrator: plan din AI (normalizedQuery + proposedFilters + steps).
  // Pentru auto-relax la 0 rezultate: aplică plan.steps[1].listingsQuery și adaugă relaxed=1 în URL;
  // maxim o relaxare per navigare (verifică !searchParams.get('relaxed') înainte de replace).
  const [orchestratorPlan, setOrchestratorPlan] = useState<{
    normalizedQuery: string;
    proposedFilters: Record<string, unknown>;
    steps: Array<{ id: string; reason: string; listingsQuery: string }>;
    uiHints: { showRelaxNotice: boolean; noticeText?: string };
  } | null>(null);
  const [isOrchestratorLoading, setIsOrchestratorLoading] = useState(false);
  const [orchestratorError, setOrchestratorError] = useState<string | null>(null);

  const submitSearchWithOrchestrator = useCallback(async (q: string) => {
    const trimmed = (q ?? "").trim();
    if (!trimmed) return;
    setIsOrchestratorLoading(true);
    setOrchestratorError(null);
    try {
      const filters: Record<string, unknown> = {};
      if (selectedCategory && selectedCategory !== "all") filters.category = selectedCategory;
      if (selectedSubcategory && selectedSubcategory !== "all") filters.subcategory = selectedSubcategory;
      if (location && location !== "all") filters.location = location;
      if (selectedBrand && selectedBrand !== "all") filters.brand = selectedBrand;
      if (selectedColor && selectedColor !== "all") filters.color = selectedColor;
      if (priceRange.min) filters.priceMin = Number(priceRange.min);
      if (priceRange.max) filters.priceMax = Number(priceRange.max);
      if (sortBy && sortBy !== "relevant") filters.sort = sortBy;
      const res = await fetch("/api/ai/search-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: trimmed, filters, sort: sortBy ?? "newest", limit: 30 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrchestratorError(data.error ?? "Eroare orchestrator");
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
        params.set("q", trimmed);
        router.replace(`/ro?${params.toString()}`, { scroll: false });
        return;
      }
      const plan = data.plan as {
        normalizedQuery: string;
        proposedFilters: Record<string, unknown>;
        steps: Array<{ id: string; reason: string; listingsQuery: string }>;
        uiHints: { showRelaxNotice: boolean; noticeText?: string };
      };
      if (plan) setOrchestratorPlan(plan);
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      params.set("q", plan?.normalizedQuery ?? trimmed);
      const pf = (plan?.proposedFilters ?? {}) as Record<string, unknown>;
      if (pf.category != null && String(pf.category)) params.set("category", String(pf.category));
      if (pf.subcategory != null && String(pf.subcategory)) params.set("subcategory", String(pf.subcategory));
      if (pf.county != null && String(pf.county)) params.set("county", String(pf.county));
      if (pf.city != null && String(pf.city)) params.set("city", String(pf.city));
      if (pf.location != null && String(pf.location)) params.set("location", String(pf.location));
      if (pf.brand != null && String(pf.brand)) params.set("brand", String(pf.brand));
      if (pf.color != null && String(pf.color)) params.set("color", String(pf.color));
      if (pf.priceMin != null) params.set("priceMin", String(pf.priceMin));
      if (pf.priceMax != null) params.set("priceMax", String(pf.priceMax));
      if (pf.sort != null && String(pf.sort)) params.set("sort", String(pf.sort));
      if (pf.model != null && String(pf.model)) params.set("model", String(pf.model));
      router.replace(`/ro?${params.toString()}`, { scroll: false });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Eroare de rețea";
      setOrchestratorError(errMsg);
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      params.set("q", (q ?? "").trim());
      router.replace(`/ro?${params.toString()}`, { scroll: false });
    } finally {
      setIsOrchestratorLoading(false);
    }
  }, [router, selectedCategory, selectedSubcategory, location, selectedBrand, selectedColor, priceRange, sortBy]);

  useEffect(() => {
    searchOrchestratorSubmitRef.current = submitSearchWithOrchestrator;
    return () => {
      searchOrchestratorSubmitRef.current = null;
    };
  }, [submitSearchWithOrchestrator]);

  // State pentru produse încărcate din localStorage
  const [productsFromStorage, setProductsFromStorage] = useState<any[]>([]);
  const [realProducts, setRealProducts] = useState<any[]>(() => initialListings?.items ?? []);
  const [isLoadingMoreRemote, setIsLoadingMoreRemote] = useState(false);
  const [nextRemoteFrom, setNextRemoteFrom] = useState(initialListings?.nextFrom ?? 0);
  const [nextRemoteCursor, setNextRemoteCursor] = useState<string | null>(
    initialListings?.nextCursor ?? null
  );
  const [hasMoreRemote, setHasMoreRemote] = useState(initialListings?.hasMore ?? true);
  const [isGeoRadiusRefreshing, setIsGeoRadiusRefreshing] = useState(false);
  /** Ultimul fetch geo la `/api/ro/listings` a eșuat — nu tăiem feed-ul SSR după rază (altfel grid gol). */
  const [geoListingsFetchFailed, setGeoListingsFetchFailed] = useState(false);
  /** Rânduri API relaxate (fără rază strictă) când feed-ul principal e gol — alimentează `auctions`. */
  const [relaxedBackupProducts, setRelaxedBackupProducts] = useState<Record<string, unknown>[]>([]);
  /** Extra carduri afișate în același grid când lista principală e sub prag; deduplicate față de `paginatedItems`. */
  const [relaxedGapFillAuctions, setRelaxedGapFillAuctions] = useState<any[]>([]);
  const [relaxedGapFillLoading, setRelaxedGapFillLoading] = useState(false);
  // Număr total din DB — preferă snapshot server (RoListServer); fallback client la /api/ro/listings-count
  const [totalCountFromDb, setTotalCountFromDb] = useState<number | null>(() =>
    typeof initialListings?.totalCount === "number" &&
    initialListings.totalCount >= (initialListings?.items?.length ?? 0)
      ? initialListings.totalCount
      : null
  );
  const [totalKindFromDb, setTotalKindFromDb] = useState<"exact" | "estimate" | "capped" | null>(
    () => initialListings?.totalKind ?? null,
  );
  /** După primul răspuns valid cu total (listări + count unificat SSR/API). */
  const [listingsCountAuthoritative, setListingsCountAuthoritative] = useState(
    () =>
      typeof initialListings?.totalCount === "number" &&
      initialListings.totalCount >= (initialListings?.items?.length ?? 0),
  );
  const [rowsScannedFromDb, setRowsScannedFromDb] = useState<number | null>(null);
  const SHOW_FILTER_OPTION_COUNTS = true;
  const [categoryCountsFromDb, setCategoryCountsFromDb] = useState<Record<string, number>>({});
  const [subcategoryCountsFromDb, setSubcategoryCountsFromDb] = useState<Record<string, number>>({});
  const [locationCountsFromDb, setLocationCountsFromDb] = useState<Record<string, number>>({});
  const categoryCountsFromDbRef = useRef<Record<string, number>>({});
  const subcategoryCountsFromDbRef = useRef<Record<string, number>>({});
  const filterCountsRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlSyncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterCountsRequestKey = useMemo(
    () => `${SHOW_FILTER_OPTION_COUNTS ? "1" : "0"}|${listingsScope}|${includeExecutariCrosslist ? "1" : "0"}|${selectedCategory}`,
    [SHOW_FILTER_OPTION_COUNTS, listingsScope, includeExecutariCrosslist, selectedCategory]
  );

  useEffect(() => {
    const clamped =
      locationRadiusKm <= 0 ? 0 : Math.min(500, Math.max(1, Math.round(locationRadiusKm)));
    if (nearLat == null || nearLng == null || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) {
      setRemoteLocationRadiusKm(clamped);
      setIsGeoRadiusRefreshing(false);
      return;
    }
    setIsGeoRadiusRefreshing(true);
    const timer = window.setTimeout(() => {
      setRemoteLocationRadiusKm(clamped);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [locationRadiusKm, nearLat, nearLng]);

  /** Avem centru valid (GPS sau oraș geocodat): API sortează după distanță; raza e opțională (cutoff). */
  const listingsHasGeoCenter = useMemo(
    () =>
      nearLat != null &&
      nearLng != null &&
      Number.isFinite(nearLat) &&
      Number.isFinite(nearLng),
    [nearLat, nearLng],
  );

  // Listare și load more: parametri din URL + scope din state (ca checkbox-urile scope să aibă efect imediat).
  const fetchRoListingsPage = useCallback(
    async (
      from: number,
      limit: number,
      cursor: string | null | undefined,
      signal?: AbortSignal,
      /** Baza query (ex. URL-ul țintă la paginare) — altfel folosește searchParams curent din router. */
      baseSearchParams?: URLSearchParams,
    ) => {
      const sp = baseSearchParams
        ? new URLSearchParams(baseSearchParams.toString())
        : searchParams
          ? new URLSearchParams(searchParams.toString())
          : new URLSearchParams();
      if (listingsScope === "live_bid" || listingsScope === "executari") {
        sp.set("scope", listingsScope);
      }
      if (includeExecutariCrosslist) {
        sp.set("includeExecutari", "1");
      } else {
        sp.delete("includeExecutari");
      }
      applyRoListingsFetchLocationMode(sp, listingsHasGeoCenter ? "geo" : "location");
      if (listingsHasGeoCenter) {
        sp.set("nearLat", String(Number(nearLat!.toFixed(3))));
        sp.set("nearLng", String(Number(nearLng!.toFixed(3))));
        if (locationRadiusKm > 0) {
          sp.set("radiusKm", String(clampRoRadiusKmForApi(remoteLocationRadiusKm)));
        } else {
          sp.delete("radiusKm");
        }
      }
      sp.set("sort", sortKeyToApiParam(sortBy));
      const params = buildListingsApiParams(sp, from, limit, cursor);
      /**
       * Defer the total whenever any location filter is active: the indexed-radius RPC returns
       * the page in a single round-trip; the count is fetched in parallel from /api/ro/listings-count.
       * This is the same pattern /api/search/results uses (no inline count).
       */
      const hasLocationFilter =
        Boolean(params.get("location")?.trim()) ||
        Boolean(params.get("city")?.trim()) ||
        Boolean(params.get("county")?.trim()) ||
        Boolean(params.get("radiusKm")?.trim()) ||
        Boolean(params.get("nearLat")?.trim());
      if (listingsHasGeoCenter || hasLocationFilter) {
        params.set("mode", "instant");
      }
      if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
        console.info("[ro/listings] fetch", `${window.location.origin}/api/ro/listings?${params.toString()}`);
      }
      return fetchRoListingsJsonCached(`/api/ro/listings?${params.toString()}`, signal);
    },
    [
      searchParams,
      listingsScope,
      includeExecutariCrosslist,
      listingsHasGeoCenter,
      nearLat,
      nearLng,
      remoteLocationRadiusKm,
      locationRadiusKm,
      sortBy,
    ]
  );

  /** Același contract ca fetchRoListingsPage, dar fără radiusKm — completare când rază strictă returnează 0 rezultate. */
  const fetchRelaxedRoListingsPage = useCallback(
    async (from: number, limit: number, cursor: string | null | undefined, signal?: AbortSignal) => {
      const sp = searchParams ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
      if (listingsScope === "live_bid" || listingsScope === "executari") {
        sp.set("scope", listingsScope);
      }
      if (includeExecutariCrosslist) {
        sp.set("includeExecutari", "1");
      } else {
        sp.delete("includeExecutari");
      }
      sp.delete("radiusKm");
      applyRoListingsFetchLocationMode(sp, listingsHasGeoCenter ? "geo" : "location");
      if (listingsHasGeoCenter) {
        sp.set("nearLat", String(Number(nearLat!.toFixed(3))));
        sp.set("nearLng", String(Number(nearLng!.toFixed(3))));
      }
      sp.set("sort", sortKeyToApiParam(sortBy));
      const params = buildListingsApiParams(sp, from, limit, cursor);
      const hasLocationFilter =
        Boolean(params.get("location")?.trim()) ||
        Boolean(params.get("city")?.trim()) ||
        Boolean(params.get("county")?.trim()) ||
        Boolean(params.get("radiusKm")?.trim()) ||
        Boolean(params.get("nearLat")?.trim());
      if (listingsHasGeoCenter || hasLocationFilter) {
        params.set("mode", "instant");
      }
      return fetchRoListingsJsonCached(`/api/ro/listings?${params.toString()}`, signal);
    },
    [searchParams, listingsScope, includeExecutariCrosslist, listingsHasGeoCenter, nearLat, nearLng, sortBy]
  );

  const fetchRoListingsPageRef = useRef(fetchRoListingsPage);
  useEffect(() => {
    fetchRoListingsPageRef.current = fetchRoListingsPage;
  }, [fetchRoListingsPage]);

  /** Semnătură din URL (fără state React) — același lucru la primul render după back ca la salvare. */
  const filtersSignatureFromUrl = useMemo(() => {
    const sp = searchParams ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
    return buildRoListingFiltersSignatureForRestore(sp);
  }, [searchParams]);

  /**
   * Paginare: include geo din state (nearLat/Lng nu sunt mereu în URL). Altfel `paginationStable` păstrează
   * „floor” de la count-ul vechi/fără rază și rămân sute de pagini afișate greșit.
   */
  const roPaginationFiltersSignature = useMemo(
    () =>
      `${filtersSignatureFromUrl}|geo:${
        listingsHasGeoCenter ? `${nearLat ?? ""}:${nearLng ?? ""}` : ""
      }|r${
        listingsHasGeoCenter && locationRadiusKm > 0
          ? clampRoRadiusKmForApi(remoteLocationRadiusKm)
          : listingsHasGeoCenter
            ? "0"
            : ""
      }`,
    [
      filtersSignatureFromUrl,
      listingsHasGeoCenter,
      nearLat,
      nearLng,
      remoteLocationRadiusKm,
      locationRadiusKm,
    ],
  );

  const personalizedHomeItems = initialListings?.personalizedHomePreview?.items ?? [];
  const showPersonalizedHomeStrip = useMemo(() => {
    if (personalizedHomeItems.length === 0) return false;
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    return isDefaultRoListingsHomeUrl(sp);
  }, [initialListings?.personalizedHomePreview, searchParams, personalizedHomeItems.length]);

  const explicitPageLimitFromUrl = useMemo(
    () => parseExplicitRoListingsPageLimitLocal(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams],
  );

  const listingsPageSize = useMemo(() => {
    if (explicitPageLimitFromUrl != null) return explicitPageLimitFromUrl;
    if (viewportIsMdUp == null) return initialListings?.pageSize ?? RO_LISTINGS_PAGE_SIZE_DESKTOP;
    return viewportIsMdUp ? RO_LISTINGS_PAGE_SIZE_DESKTOP : RO_LISTINGS_PAGE_SIZE_MOBILE;
  }, [explicitPageLimitFromUrl, viewportIsMdUp, initialListings?.pageSize]);

  const prefetchRoMarketplaceFirstPage = useCallback(
    (baseSearchParams: URLSearchParams) => {
      if (typeof window === "undefined") return;
      roListingsPrefetchAbortRef.current?.abort();
      const ac = new AbortController();
      roListingsPrefetchAbortRef.current = ac;
      const sp = new URLSearchParams(baseSearchParams.toString());
      sp.delete("page");
      sp.delete("from");
      void fetchRoListingsPage(0, listingsPageSize, null, ac.signal, sp).catch(() => {});
    },
    [fetchRoListingsPage, listingsPageSize],
  );

  useEffect(() => {
    prefetchRoMarketplaceFirstPageRef.current = prefetchRoMarketplaceFirstPage;
  }, [prefetchRoMarketplaceFirstPage]);

  const roPagination = useMemo(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (explicitPageLimitFromUrl == null) {
      sp.set("limit", String(listingsPageSize));
    }
    return getRoListingsPaginationFromSearchParams(sp);
  }, [searchParams, explicitPageLimitFromUrl, listingsPageSize]);

  const listingsUrlPage = roPagination.page;
  const listingsOffset = roPagination.from;

  const serverSnapshotLimit = useMemo(
    () => initialListings?.pageSize ?? listingsPageSize,
    [initialListings?.pageSize, listingsPageSize],
  );

  const [isPageNavigating, setIsPageNavigating] = useState(false);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  /**
   * În timpul `startRouteTransition`, `useSearchParams()` poate rămâne în urmă față de bara de adresă.
   * `pendingPage` reflectă imediat click-ul din paginare — altfel fetch-ul folosea offset-ul paginii vechi,
   * iar răspunsurile „în curs” puteau suprascrie lista cu date din pagina greșită la navigare rapidă.
   */
  const listingsOffsetForFetch = useMemo(() => {
    if (pendingPage != null) {
      return (pendingPage - 1) * listingsPageSize;
    }
    return listingsOffset;
  }, [pendingPage, listingsOffset, listingsPageSize]);
  const paginationPrefetchAbortRef = useRef<AbortController | null>(null);
  const pendingListingsPageCursorRef = useRef<string | null>(null);

  const goToListingsPage = useCallback(
    (page: number) => {
      const capped = Math.min(Math.max(1, Math.round(page)), RO_LISTINGS_MAX_PAGE);
      if (capped === listingsUrlPage) return;
      setPendingPage(capped);
      setIsPageNavigating(true);
      const nextOffset = (capped - 1) * listingsPageSize;
      const cursorForSequentialNext = capped === listingsUrlPage + 1 ? nextRemoteCursor : null;
      pendingListingsPageCursorRef.current = cursorForSequentialNext;
      const sp = new URLSearchParams(searchParams.toString());
      if (capped <= 1) {
        sp.delete("page");
        sp.delete("from");
      } else {
        sp.set("page", String(capped));
        sp.delete("from");
      }
      const qs = sp.toString();

      // Prefetch: același URL API ca după router.replace → la primul render cu noul `searchParams`,
      // fetchRoListingsJsonCached lovește cache / promise în zbor → paginare mult mai „instant”.
      if (!locationGeocodeBusy) {
        paginationPrefetchAbortRef.current?.abort();
        const prefetchAc = new AbortController();
        paginationPrefetchAbortRef.current = prefetchAc;
        void fetchRoListingsPage(nextOffset, listingsPageSize, cursorForSequentialNext, prefetchAc.signal, sp).catch(() => {
          // Abort la click rapid sau rețea: efectul principal reia încărcarea.
        });
      }

      startRouteTransition(() => {
        router.replace(qs ? `/ro?${qs}` : "/ro", { scroll: false });
      });
    },
    [
      fetchRoListingsPage,
      listingsPageSize,
      listingsUrlPage,
      nextRemoteCursor,
      router,
      searchParams,
      startRouteTransition,
      locationGeocodeBusy,
    ],
  );

  const prefetchListingsPageHover = useCallback(
    (page: number) => {
      const capped = Math.min(Math.max(1, Math.round(page)), RO_LISTINGS_MAX_PAGE);
      if (capped === listingsUrlPage) return;
      const nextOffset = (capped - 1) * listingsPageSize;
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (capped <= 1) {
        sp.delete("page");
        sp.delete("from");
      } else {
        sp.set("page", String(capped));
        sp.delete("from");
      }
      const cursorForSequentialNext = capped === listingsUrlPage + 1 ? nextRemoteCursor : null;
      void fetchRoListingsPage(nextOffset, listingsPageSize, cursorForSequentialNext, undefined, sp).catch(() => {});
    },
    [fetchRoListingsPage, listingsPageSize, listingsUrlPage, nextRemoteCursor, searchParams],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (locationGeocodeBusy) return;
    const p = listingsUrlPage;
    for (const n of [p - 1, p + 1]) {
      if (n >= 1 && n <= RO_LISTINGS_MAX_PAGE) prefetchListingsPageHover(n);
    }
  }, [listingsUrlPage, prefetchListingsPageHover, locationGeocodeBusy]);

  useEffect(() => {
    if (pendingPage == null) return;
    if (listingsUrlPage !== pendingPage) return;
    const timer = window.setTimeout(() => {
      setIsPageNavigating(false);
      setPendingPage(null);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [listingsUrlPage, pendingPage]);

  useEffect(() => {
    setRelaxedBackupProducts([]);
    setRelaxedGapFillAuctions([]);
  }, [filtersSignatureFromUrl]);

  // Încarcă produsele din localStorage și le convertește în licitații
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const loadStorage = () => {
      if (cancelled) return;
      const savedProducts = localStorage.getItem('products');
      if (!savedProducts) return;
      try {
        const products = JSON.parse(savedProducts);
        // Include atât produsele 'live-bid' cât și 'details-only' (active și rezervate)
        const activeProducts = products.filter((p: any) =>
          (p.status === 'active' || p.status === 'reserved' || p.status === 'sold' || p.status === 'in_progress') &&
          (p.productType === 'live-bid' || p.productType === 'details-only' || !p.productType)
        );
        if (!cancelled) setProductsFromStorage(activeProducts);
      } catch (e) {
        console.error('Error loading products:', e);
      }
    };

    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(loadStorage, { timeout: 1200 });
      return () => {
        cancelled = true;
        if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback(id);
      };
    }

    const timeoutId = setTimeout(loadStorage, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  /** Primul page din cache server (RoListServer); la navigare / schimbare URL refacem pagina curentă (?page / offset). */
  const filterRows = useCallback((rows: Record<string, unknown>[]): Record<string, unknown>[] => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return rows.filter((p) => {
      if (p.status !== "sold") return true;
      const soldAt = typeof p.sold_at === "string" ? p.sold_at : "";
      return !soldAt || soldAt >= twentyFourHoursAgo;
    });
  }, []);

  const activeExactRequestIdRef = useRef(0);
  /** Debounce client refetch after URL settles so sync + resolve-location coalesce into one `/api/ro/listings` call. */
  const LISTINGS_MAIN_FETCH_DEBOUNCE_MS = 250;
  const listingsMainFetchDebounceTimerRef = useRef<number | null>(null);
  const listingsMainFetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const firstPage = initialListings?.items || [];
    const firstPageFiltered = filterRows(firstPage);
    const urlSortNorm = normalizeRoListingsSortKey(searchParams?.get("sort"));
    const snapshotSortFromServer =
      initialListings?.snapshotSort !== undefined
        ? normalizeRoListingsSortKey(initialListings.snapshotSort)
        : urlSortNorm;
    const sortMatchesSnapshot =
      initialListings == null ||
      (snapshotSortFromServer === urlSortNorm && sortBy === urlSortNorm);
    const ssrResolved = initialListings?.resolvedCenter;
    const hasClientGeo =
      nearLat != null &&
      nearLng != null &&
      Number.isFinite(nearLat) &&
      Number.isFinite(nearLng);
    const ssrGeoMatches =
      !hasClientGeo ||
      (ssrResolved != null &&
        Math.abs(nearLat! - ssrResolved.lat) < 0.001 &&
        Math.abs(nearLng! - ssrResolved.lng) < 0.001);
    const canUseServerSnapshot =
      initialListings != null &&
      sortMatchesSnapshot &&
      ssrGeoMatches &&
      listingsOffsetForFetch === (initialListings?.from ?? 0) &&
      listingsPageSize === serverSnapshotLimit;

    /** În timpul geocode-ului client (`resolve-location`) nu folosim snapshot SSR — așteptăm coordonate stabile. */
    const shouldUseServerSnapshot = canUseServerSnapshot && !locationGeocodeBusy;

    const commitExactPayload = (
      requestId: number,
      payload: {
        items?: Record<string, unknown>[];
        total?: number;
        total_kind?: "exact" | "estimate" | "capped";
        nextFrom?: number;
        nextCursor?: string | null;
        hasMore?: boolean;
        resolved_center?: { lat: number; lng: number; match: string };
      },
    ) => {
      if (activeExactRequestIdRef.current !== requestId) return;
      if (payload.resolved_center && typeof payload.resolved_center.lat === "number") {
        setNearLat(payload.resolved_center.lat);
        setNearLng(payload.resolved_center.lng);
      }
      const page = Array.isArray(payload.items) ? payload.items : [];
      setRealProducts(filterRows(page));
      if (typeof payload.total === "number") {
        setTotalCountFromDb(payload.total);
        setTotalKindFromDb(payload.total_kind ?? "exact");
        setListingsCountAuthoritative(true);
      }
      setNextRemoteFrom(typeof payload.nextFrom === "number" ? payload.nextFrom : page.length);
      setNextRemoteCursor(payload.nextCursor ?? null);
      setHasMoreRemote(!!payload.hasMore);
    };

    if (shouldUseServerSnapshot) {
      if (listingsMainFetchDebounceTimerRef.current) {
        clearTimeout(listingsMainFetchDebounceTimerRef.current);
        listingsMainFetchDebounceTimerRef.current = null;
      }
      listingsMainFetchAbortRef.current?.abort();
      activeExactRequestIdRef.current += 1;
      setRealProducts(firstPageFiltered);
      setNextRemoteFrom(typeof initialListings?.nextFrom === "number" ? initialListings.nextFrom : firstPage.length);
      setNextRemoteCursor(initialListings?.nextCursor ?? null);
      setHasMoreRemote(initialListings?.hasMore ?? true);
      setIsLoadingMoreRemote(false);
      setIsGeoRadiusRefreshing(false);
      return;
    }

    if (locationGeocodeBusy) {
      if (listingsMainFetchDebounceTimerRef.current) {
        clearTimeout(listingsMainFetchDebounceTimerRef.current);
        listingsMainFetchDebounceTimerRef.current = null;
      }
      listingsMainFetchAbortRef.current?.abort();
      setIsLoadingMoreRemote(false);
      setIsGeoRadiusRefreshing(false);
      return () => {
        if (listingsMainFetchDebounceTimerRef.current) {
          clearTimeout(listingsMainFetchDebounceTimerRef.current);
          listingsMainFetchDebounceTimerRef.current = null;
        }
        listingsMainFetchAbortRef.current?.abort();
      };
    }

    if (listingsMainFetchDebounceTimerRef.current) {
      clearTimeout(listingsMainFetchDebounceTimerRef.current);
      listingsMainFetchDebounceTimerRef.current = null;
    }
    listingsMainFetchAbortRef.current?.abort();

    listingsMainFetchDebounceTimerRef.current = window.setTimeout(() => {
      listingsMainFetchDebounceTimerRef.current = null;
      const requestId = ++activeExactRequestIdRef.current;
      const fetchAc = new AbortController();
      listingsMainFetchAbortRef.current = fetchAc;
      setIsLoadingMoreRemote(true);
      setIsGeoRadiusRefreshing(listingsHasGeoCenter);
      setGeoListingsFetchFailed(false);

      const loadCurrentPage = async () => {
        try {
          const cursorForCurrentPage = pendingListingsPageCursorRef.current;
          pendingListingsPageCursorRef.current = null;
          const payload = await fetchRoListingsPageRef.current(
            listingsOffsetForFetch,
            listingsPageSize,
            cursorForCurrentPage,
            fetchAc.signal,
          );
          if (fetchAc.signal.aborted) return;
          if (activeExactRequestIdRef.current !== requestId) return;
          if (!payload.success) {
            setGeoListingsFetchFailed(true);
            return;
          }
          setGeoListingsFetchFailed(false);
          commitExactPayload(requestId, payload);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          if (activeExactRequestIdRef.current !== requestId) return;
          setGeoListingsFetchFailed(true);
          console.error("Error loading products page:", error);
        } finally {
          if (!fetchAc.signal.aborted && activeExactRequestIdRef.current === requestId) {
            setIsLoadingMoreRemote(false);
            setIsGeoRadiusRefreshing(false);
          }
        }
      };
      void loadCurrentPage();
    }, LISTINGS_MAIN_FETCH_DEBOUNCE_MS);

    return () => {
      if (listingsMainFetchDebounceTimerRef.current) {
        clearTimeout(listingsMainFetchDebounceTimerRef.current);
        listingsMainFetchDebounceTimerRef.current = null;
      }
      listingsMainFetchAbortRef.current?.abort();
    };
  }, [
    filtersSignatureFromUrl,
    filterRows,
    initialListings,
    listingsOffsetForFetch,
    listingsPageSize,
    serverSnapshotLimit,
    listingsHasGeoCenter,
    remoteLocationRadiusKm,
    locationRadiusKm,
    sortBy,
    searchParams,
    nearLat,
    nearLng,
    locationGeocodeBusy,
  ]);

  useEffect(() => {
    if (!mounted || !hasMoreRemote || isLoadingMoreRemote || locationGeocodeBusy) return;
    const nextOffset = listingsOffsetForFetch + listingsPageSize;
    if (nextOffset <= listingsOffsetForFetch || nextOffset > RO_LISTINGS_MAX_PAGE * listingsPageSize) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchRoListingsPageRef.current(
        nextOffset,
        listingsPageSize,
        nextRemoteCursor,
        controller.signal,
      ).catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
      });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mounted, hasMoreRemote, isLoadingMoreRemote, listingsOffsetForFetch, listingsPageSize, nextRemoteCursor, locationGeocodeBusy]);

  /** Trebuie să coincidă cu `fetchRoListingsPage`: scope/crosslist + nearLat/nearLng din state; radiusKm doar dacă rază > 0. */
  const countQueryString = useMemo(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (listingsScope === "live_bid" || listingsScope === "executari") {
      sp.set("scope", listingsScope);
    }
    if (includeExecutariCrosslist) {
      sp.set("includeExecutari", "1");
    } else {
      sp.delete("includeExecutari");
    }
    applyRoListingsFetchLocationMode(sp, listingsHasGeoCenter ? "geo" : "location");
    if (listingsHasGeoCenter) {
      sp.set("nearLat", String(Number(nearLat!.toFixed(3))));
      sp.set("nearLng", String(Number(nearLng!.toFixed(3))));
      if (locationRadiusKm > 0) {
        sp.set("radiusKm", String(clampRoRadiusKmForApi(remoteLocationRadiusKm)));
      } else {
        sp.delete("radiusKm");
      }
    }
    return buildRoListingsCountQueryString(sp);
  }, [
    searchParams,
    listingsScope,
    includeExecutariCrosslist,
    listingsHasGeoCenter,
    nearLat,
    nearLng,
    remoteLocationRadiusKm,
    locationRadiusKm,
  ]);

  useEffect(() => {
    setListingsCountAuthoritative(false);
    setTotalKindFromDb(null);
  }, [countQueryString]);

  // Re-aplică snapshot SSR când revine `initialListings` (ex. navigare); count-ul strict vine din același GET ca grid-ul.
  useEffect(() => {
    if (!initialListings) return;
    const minimumLoadedTotal = listingsOffsetForFetch + realProducts.length + (hasMoreRemote ? 1 : 0);
    const initialTotal =
      typeof initialListings.totalCount === "number" && initialListings.totalCount >= minimumLoadedTotal
        ? initialListings.totalCount
        : null;
    if (typeof initialTotal === "number") {
      setTotalCountFromDb(initialTotal);
      setTotalKindFromDb(initialListings.totalKind ?? "exact");
      setListingsCountAuthoritative(true);
    }
  }, [initialListings, listingsOffsetForFetch, hasMoreRemote, realProducts.length]);

  // Numere exacte din DB pentru filtre (categorii + subcategorii), via endpoint server-side.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const fetchFilterCounts = async () => {
      if (!SHOW_FILTER_OPTION_COUNTS) {
        setRowsScannedFromDb(null);
        setCategoryCountsFromDb({});
        setSubcategoryCountsFromDb({});
        setLocationCountsFromDb({});
        return;
      }
      try {
        const params = new URLSearchParams();
        if (listingsScope === 'live_bid' || listingsScope === 'executari') {
          params.set('scope', listingsScope);
        }
        if (includeExecutariCrosslist) {
          params.set('includeExecutari', '1');
        }
        if (selectedCategory !== 'all') {
          params.set('category', selectedCategory);
        }
        const qs = params.toString();
        const response = await fetch(`/api/ro/filter-counts${qs ? `?${qs}` : ''}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (cancelled) return;
        const nextCategoryCounts =
          data?.categoryCounts && typeof data.categoryCounts === 'object' ? data.categoryCounts : {};
        const nextSubcategoryCounts =
          data?.subcategoryCounts && typeof data.subcategoryCounts === 'object' ? data.subcategoryCounts : {};
        const nextLocationCounts =
          data?.locationCounts && typeof data.locationCounts === 'object' ? data.locationCounts : {};
        const hasExistingCounts =
          Object.keys(categoryCountsFromDbRef.current).length > 0 ||
          Object.keys(subcategoryCountsFromDbRef.current).length > 0;
        const isDegradedResponse = data?.degraded === true;
        const isStaleResponse = data?.stale === true;
        if (isStaleResponse && !filterCountsRetryTimerRef.current) {
          filterCountsRetryTimerRef.current = setTimeout(() => {
            filterCountsRetryTimerRef.current = null;
            if (!cancelled) {
              void fetchFilterCounts();
            }
          }, 2500);
        }
        if (isDegradedResponse && hasExistingCounts) {
          setRowsScannedFromDb(typeof data?.rowsScanned === 'number' ? data.rowsScanned : null);
          return;
        }
        setRowsScannedFromDb(typeof data?.rowsScanned === 'number' ? data.rowsScanned : null);
        categoryCountsFromDbRef.current = nextCategoryCounts;
        setCategoryCountsFromDb(nextCategoryCounts);
        setLocationCountsFromDb(nextLocationCounts);
        if (selectedCategory === 'all') {
          subcategoryCountsFromDbRef.current = {};
          setSubcategoryCountsFromDb({});
        } else {
          subcategoryCountsFromDbRef.current = nextSubcategoryCounts;
          setSubcategoryCountsFromDb(nextSubcategoryCounts);
        }
      } catch (e) {
        if (cancelled) return;
        setRowsScannedFromDb(null);
        if (e instanceof Error && e.name === "AbortError") return;
        console.warn('Filter counts error:', e);
      }
    };
    const debounceTimer = setTimeout(() => {
      void fetchFilterCounts();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      controller.abort();
      if (filterCountsRetryTimerRef.current) {
        clearTimeout(filterCountsRetryTimerRef.current);
        filterCountsRetryTimerRef.current = null;
      }
    };
  }, [filterCountsRequestKey, listingsScope, includeExecutariCrosslist, selectedCategory, SHOW_FILTER_OPTION_COUNTS]);

  // Căutare după imagine - folosește rezultatele din sessionStorage (nou sistem AI + Pinecone)
  useEffect(() => {
    const imageSearch = searchParams?.get('imageSearch');

    if (imageSearch === 'true') {
      setIsImageSearching(true);

      // Load results from sessionStorage
      try {
        const storedResults = sessionStorage.getItem('imageSearchResults');
        const storedError = sessionStorage.getItem('imageSearchError');

        if (storedError) {
          console.error('[Image Search] Error from sessionStorage:', storedError);
          setImageSearchProductIds([]);
          sessionStorage.removeItem('imageSearchError');
          setIsImageSearching(false);
          return;
        }

        if (storedResults) {
          const results = JSON.parse(storedResults);
          console.log('[Image Search] Loaded results from sessionStorage:', results);

          if (results.similars && results.similars.length > 0) {
            // Extract product IDs from similars
            const productIds = results.similars.map((s: any) => s.productId).filter(Boolean);
            console.log('[Image Search] ✅ Found', productIds.length, 'similar products');
            console.log('[Image Search] Product IDs:', productIds.slice(0, 5));
            setImageSearchProductIds(productIds);
          } else {
            // No results found - show all products but with a message
            console.log('[Image Search] No similar products found, showing all products');
            console.log('[Image Search] Match status:', results.match?.status);
            console.log('[Image Search] Similars array:', results.similars);
            setImageSearchProductIds([]);
          }

          // Clear sessionStorage after use
          sessionStorage.removeItem('imageSearchResults');
        } else {
          console.log('[Image Search] No results in sessionStorage');
          setImageSearchProductIds([]);
        }
      } catch (error) {
        console.error('[Image Search] Error loading results:', error);
        setImageSearchProductIds([]);
      } finally {
        setIsImageSearching(false);
      }
    } else {
      // Reset filtering if no image search
      setImageSearchProductIds(null);
    }
  }, [searchParams]);

  // Miezul nopții următoare (00:00) – pentru „în orice zi” ceasul se resetează la 00:00
  const getNextMidnight = (): Date => {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    n.setHours(0, 0, 0, 0);
    return n;
  };

  /** Data în 30 de zile (pentru licitații cu data în trecut – pe listare afișăm 30 zile). */
  const getDateIn30Days = (): Date => {
    const n = new Date();
    n.setDate(n.getDate() + 30);
    n.setHours(12, 0, 0, 0);
    return n;
  };

  /** True dacă data e în trecut. Acceptă ISO (YYYY-MM-DD) și EU (DD.MM.YYYY / DD/MM/YYYY). */
  const isDateInPast = (raw: string | undefined): boolean => {
    if (!raw || !String(raw).trim()) return true;
    const s = String(raw).trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    let d: Date;
    if (isoMatch) {
      d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    } else if (euMatch) {
      d = new Date(parseInt(euMatch[3], 10), parseInt(euMatch[2], 10) - 1, parseInt(euMatch[1], 10), 12, 0, 0);
    } else {
      d = new Date(s.slice(0, 10) + 'T12:00:00');
    }
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() < today.getTime();
  };

  // Convertește produsele în format de licitații
  const convertProductToAuction = (product: any): any => {
    // Extrage imagini din array sau string (suportă atât format Supabase cât și format localStorage)
    const images = Array.isArray(product.images)
      ? product.images.filter((img: any) => typeof img === 'string')
      : [];
    // Pentru LP/Executări, fallback-ul de imagine trebuie să urmeze listing_category (teren, apartamente etc.),
    // altfel se poate afișa generic utilaje chiar când cardul este afișat la imobiliare.
    const isPublicAuctionProduct =
      String(product?.product_type || "").toLowerCase() === "licitatii-publice" ||
      String(product?.sale_type || "").toLowerCase() === "licitatie-publica" ||
      String(product?.sale_type || "").toLowerCase() === "licitatii-insolventa";
    const currentCategoryDisplay = isPublicAuctionProduct
      ? (product?.custom_fields?.listing_main_category ?? product?.custom_fields?.main_category ?? product?.category ?? product?.main_category)
      : (product?.category ?? product?.main_category ?? product?.custom_fields?.main_category ?? product?.custom_fields?.listing_main_category);
    const currentSubcategoryDisplay = isPublicAuctionProduct
      ? (product?.custom_fields?.listing_category ?? product?.subcategory)
      : (product?.subcategory ?? product?.custom_fields?.listing_category);
    const firstImage = getProductDisplayImage({
      images: product?.images,
      image: images[0],
      category: currentCategoryDisplay,
      subcategory: currentSubcategoryDisplay,
      main_category: currentCategoryDisplay,
    });

    const isRollingDaily = product.custom_fields?.auction_rolling_daily === true;
    const isRollingWeekly = product.custom_fields?.rolling_weekly_weekday != null;
    const rawDate = product.auction_date || product.end_time;
    const use30DayFallback = !isRollingDaily && !isRollingWeekly && rawDate && isDateInPast(rawDate);

    let effectiveEndDate: Date | null;
    let effectiveAuctionDateIso: string | undefined;
    if (isRollingDaily) {
      effectiveEndDate = getNextMidnight();
      effectiveAuctionDateIso = getNextMidnight().toISOString();
    } else if (use30DayFallback) {
      const in30 = getDateIn30Days();
      effectiveEndDate = in30;
      effectiveAuctionDateIso = in30.toISOString();
    } else if (rawDate) {
      const parsed = new Date(rawDate);
      effectiveEndDate = Number.isNaN(parsed.getTime()) ? null : parsed;
      effectiveAuctionDateIso = product.auction_date || product.auctionDate;
    } else {
      effectiveEndDate = null;
      effectiveAuctionDateIso = product.auction_date || product.auctionDate;
    }

    // Calculează timp rămas din auction_date sau end_time (pentru produse reale); „în orice zi” → 24h până la miezul nopții
    let timeLeft = '2h 15m';
    if (effectiveEndDate) {
      const now = new Date();
      const diffMs = effectiveEndDate.getTime() - now.getTime();

      if (diffMs > 0) {
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
          timeLeft = `${days} ${days === 1 ? 'zi' : 'zile'}`;
        } else if (hours > 0) {
          timeLeft = `${hours}h ${minutes}m`;
        } else {
          timeLeft = `${minutes}m`;
        }
      } else {
        timeLeft = 'Terminat';
      }
    } else if (!product.auction_date && !product.end_time) {
      // Determinist pentru același produs (evită hydration mismatch server/client)
      const seed = String(product.id ?? product.slug ?? product.title ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const daysLeft = (seed % 7) + 1;
      timeLeft = daysLeft === 1 ? '2h 15m' : `${daysLeft} zile`;
    }

    // Generează URL-ul corect bazat pe product_type (Supabase) sau productType (localStorage)
    const getProductUrl = (product: any): string => {
      if (product.url) {
        return product.url;
      }
      if (product.slug) {
        const productTypeRoutes: Record<string, string> = {
          'licitatii-publice': 'licitatii-publice',
          'live-bid': 'live_bid',
          'buy-now': 'produs',
        };
        // Suportă atât product_type (Supabase) cât și productType (localStorage)
        const productType = product.product_type || product.productType || 'produse';
        const route = productTypeRoutes[productType] || 'produse';
        return `/${route}/${product.slug}`;
      }
      return `#`;
    };

    const productUrl = getProductUrl(product);
    const productId = product.slug || product.id || `product-${product.id}`;

    // Extrage prețul Lei și EUR pentru filtrare/afișare în ambele monede
    const rawRon = product.starting_price_ron ?? product.starting_price ?? product.startingPrice
      ?? product.custom_fields?.pret ?? product.custom_fields?.valoare_estimata ?? product.custom_fields?.price;
    let priceRonNum = typeof rawRon === 'number' && !Number.isNaN(rawRon) ? rawRon : (typeof rawRon === 'string' ? (parseFloat(rawRon) || 0) : (Number(rawRon) || 0));
    const rawEur = product.starting_price_eur ?? product.custom_fields?.pret_eur;
    const priceEurNum = typeof rawEur === 'number' && !Number.isNaN(rawEur) ? rawEur : (typeof rawEur === 'string' ? (parseFloat(rawEur) || 0) : (Number(rawEur) || 0));
    const { priceRon: priceRonFinal, priceEur: priceEurFinal } = toPriceRonAndEur(priceRonNum, priceEurNum);
    const startingPrice = priceRonFinal;

    // Extrage locația – același logic ca pe homepage (localhost:3000): oraș, județ, adresă
    const cf = product.custom_fields && typeof product.custom_fields === 'object' ? (product.custom_fields as Record<string, unknown>) : {};

    // Moneda listării: dacă nu e EUR, afișarea în EUR e conversie din RON (rotunjită la 0/5). Nu folosi starting_price_eur>0 — în DB e adesea derivat din RON.
    const listingCurrencyNorm = String(product.currency ?? cf.currency ?? 'RON')
      .toUpperCase()
      .replace(/\s+/g, '');
    const listingPricedInEur =
      listingCurrencyNorm === 'EUR' || listingCurrencyNorm === 'EURO';
    const cityVal = (product.city ?? cf.city ?? cf.oras ?? cf.city_name ?? '').toString().trim();
    const countyVal = (product.county ?? cf.county ?? cf.judet ?? cf.județ ?? '').toString().trim();
    const addressVal = (
      product.auction_location ??
      product.product_location ??
      product.location ??
      product.address ??
      cf.auction_location ??
      cf.product_location ??
      cf.address ??
      cf.locatie ??
      cf.locație ??
      cf.location ??
      ''
    ).toString().trim();
    const locationParts = [cityVal, countyVal, addressVal].filter(Boolean);
    const location = locationParts.length > 0
      ? locationParts.join(', ')
      : (
        product.auction_location ||
        product.product_location ||
        product.location ||
        product.address ||
        product.city ||
        (cf.locatie as string | undefined) ||
        (cf.locație as string | undefined) ||
        (cf.location as string | undefined) ||
        'Locație neprecizată'
      );

    // Extrage anul (an fabricație din custom_fields sau fallback la an creare)
    const createdAt = product.created_at || product.createdAt;
    const yearFromCf = product.custom_fields?.an != null ? String(product.custom_fields.an).trim() : '';
    const year = yearFromCf || (createdAt ? new Date(createdAt).getFullYear().toString() : new Date().getFullYear().toString());

    // Câmpuri din custom_fields pentru filtre (model, kilometraj, combustibil, cutie)
    const model = (product.custom_fields?.model ?? product.custom_fields?.model_label ?? '').toString().trim() || '';
    const mileage = product.custom_fields?.kilometraj != null ? String(product.custom_fields.kilometraj).trim() : '';
    const capacitateCilindrica = product.custom_fields?.capacitate_cilindrica ?? product.custom_fields?.capacitateCilindrica ?? '';
    const fuelType = (product.custom_fields?.combustibil ?? '').toString().trim() || '';
    const transmission = (product.custom_fields?.cutie ?? '').toString().trim() || '';

    // Câmpuri imobiliare din custom_fields (pentru filtre level 4)
    const surface = product.custom_fields?.suprafata != null ? String(product.custom_fields.suprafata).trim() : '';
    const rooms = (product.custom_fields?.numarcamere ?? product.custom_fields?.numar_camere ?? product.custom_fields?.camere ?? product.custom_fields?.numarCamere ?? '').toString().trim() || '';
    const floor = (product.custom_fields?.etaj ?? '').toString().trim() || '';
    const landSurface = (product.custom_fields?.suprafataTeren ?? product.custom_fields?.suprafata_teren ?? '').toString().trim() || '';
    const gradina = (product.custom_fields?.gradina ?? '').toString().toLowerCase() === 'da';
    const garaj = (product.custom_fields?.garaj ?? '').toString().toLowerCase() === 'da';
    const piscina = (product.custom_fields?.piscina ?? '').toString().toLowerCase() === 'da';

    return {
      id: productId,
      productDbId: product.id, // Păstrăm ID-ul original din baza de date pentru filtrare
      url: productUrl,
      title: product.title || 'Produs',
      image: firstImage,
      currentBid: startingPrice,
      priceRon: priceRonFinal,
      priceEur: priceEurFinal,
      /** Listare în EUR (product.currency); dacă e RON, EUR pe card e conversie → rotunjit la afișare. */
      listingPricedInEur,
      timeLeft: timeLeft,
      description: product.description || '',
      seller: 'Vânzător',
      condition: product.condition || 'Nouă',
      year,
      location: location,
      city: cityVal || undefined,
      county: countyVal || undefined,
      shipping: product.shipping || 'Gratuit în România',
      paymentMethods: Array.isArray(product.payment_methods)
        ? product.payment_methods
        : (Array.isArray(product.paymentMethods) ? product.paymentMethods : ['Card bancar', 'Transfer bancar']),
      returnPolicy: product.return_policy || product.returnPolicy || '14 zile retur',
      warranty: product.warranty || '1 an garanție',
      category: (product.category || 'diverse').toLowerCase(),
      subcategory: (product.subcategory || 'diverse').toLowerCase(),
      category_level_3: product.category_level_3 || product.categoryLevel3 || null,
      category_level_4: product.category_level_4 || product.categoryLevel4 || null,
      categoryLevel3: (product.category_level_3 || product.categoryLevel3 || '').toLowerCase(),
      size: product.size || '',
      brand: (product.custom_fields?.marca ?? product.custom_fields?.brand ?? product.brand ?? '').toString().trim() || '',
      color: (product.custom_fields?.culoare ?? product.color ?? '').toString().trim() || '',
      model,
      mileage,
      capacitateCilindrica: capacitateCilindrica ? String(capacitateCilindrica).trim() : '',
      fuelType,
      transmission,
      surface,
      rooms,
      floor,
      buildingYear: yearFromCf,
      landSurface,
      gradina,
      garaj,
      piscina,
      isTest: false,
      productType: product.product_type || product.productType || 'live-bid',
      saleType: product.sale_type || product.saleType || 'vanzare-directa',
      auctionDate: effectiveAuctionDateIso,
      createdAt: product.created_at || product.createdAt,
      updated_at: product.updated_at ?? product.updatedAt,
      address: product.address,
      coordinates: product.coordinates ?? cf.coordinates,
      currency: product.currency || 'RON',
      status: product.status || 'active',
      isPremium: Boolean(product.is_premium ?? product.isPremium ?? false),
      isUrgent: Boolean(cf.is_urgent ?? cf.isUrgent ?? false),
      isFreeListing: Boolean(cf.is_free_listing ?? cf.isFreeListing ?? false),
      // Executări și Insolvență: Cat. principală + Categorie (din listări)
      main_category: (product.custom_fields as any)?.listing_main_category ?? product.category ?? null,
      list_category: (product.custom_fields as any)?.listing_category ?? null,
      image_focal_by_url: (product as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> }).image_focal_by_url,
    };
  };

  // Generate real auctions - one from each main category
  const generateRealAuctions = () => {
    const realAuctions = [
      // Imobiliare - Apartamente
      {
        id: 'real-auction-1',
        title: 'Apartament 3 camere, renovat, Sector 1, București',
        image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 185000,
        timeLeft: '4 zile',
        description: 'Apartament spațios cu 3 camere, 2 băi, renovat complet în 2023. Etaj 5/10, orientare sud, balcon mare, vedere liberă. Centrală termică proprie, termopane, izolație termică. Apartamentul este situat într-o zonă rezidențială liniștită, aproape de metrou, școli, magazine și parcuri.',
        seller: 'Proprietar',
        condition: 'Foarte bună',
        year: '2010',
        location: 'București, Sector 1',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Transfer bancar', 'Credit ipotecar'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Garanție bună funcționare',
        category: 'imobiliare',
        subcategory: 'apartamente',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        address: 'Str. Victoriei nr. 45, Sector 1, București',
        coordinates: { lat: 44.4468, lng: 26.0968 },
        isTest: false
      },
      // Imobiliare - Case și vile (pentru filtrare)
      {
        id: 'real-auction-case-vile',
        title: 'Casă cu 4 camere, grădină 500 mp, Sector 2, București',
        image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 285000,
        timeLeft: '5 zile',
        description: 'Casă individuală cu 4 camere, 2 băi, garaj și grădină de 500 mp. Construcție 2010, renovată în 2022. Zonă rezidențială liniștită, aproape de metrou și școli.',
        seller: 'Proprietar',
        condition: 'Foarte bună',
        year: '2010',
        location: 'București, Sector 2',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Transfer bancar', 'Credit ipotecar'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Garanție bună funcționare',
        category: 'imobiliare',
        subcategory: 'case-vile',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        address: 'Str. Grădiniței nr. 12, Sector 2, București',
        coordinates: { lat: 44.4520, lng: 26.1234 },
        isTest: false
      },
      // Autovehicule - Autoturisme
      {
        id: 'real-auction-2',
        title: 'Dacia Duster 2021, 1.5 dCi, 4x4, 85000 km',
        image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 28500,
        timeLeft: '2 zile',
        description: 'Dacia Duster 1.5 dCi 115CP, an 2021, 85000 km reali, cutie manuală 6 trepte, tracțiune integrală 4x4. Full service la reprezentanță, un singur proprietar, accidente zero. Optiuni: AC, Bluetooth, senzori parcare, camera spate, volan încălzit.',
        seller: 'Vânzător Auto',
        condition: 'Excelentă',
        year: '2021',
        location: 'Cluj-Napoca',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Card bancar', 'Transfer bancar', 'Leasing'],
        returnPolicy: 'Nu se aplică',
        warranty: '6 luni garanție',
        category: 'autovehicule',
        subcategory: 'autoturisme',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Executări Silite - Imobile
      {
        id: 'real-auction-3',
        title: 'Vilă executare silită, 4 camere, Brașov',
        image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 320000,
        timeLeft: '6 zile',
        description: 'Vilă cu 4 camere, 3 băi, garaj pentru 2 mașini, grădină de 800 mp. Executare silită prin instanță. Proprietatea este situată într-o zonă rezidențială de lux, cu acces la utilități. Necesită renovare parțială.',
        seller: 'Executor Judecătoresc',
        condition: 'Bună',
        year: '2015',
        location: 'Brașov',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Transfer bancar', 'Credit ipotecar'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'executari',
        subcategory: 'exec-imobiliare',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        address: 'Calea Bucureștiului nr. 120, Brașov',
        coordinates: { lat: 45.6427, lng: 25.5887 },
        isTest: false
      },
      // Utilaje - Utilaje Construcții
      {
        id: 'real-auction-4',
        title: 'Excavator JCB 3CX, 2019, 2500 ore',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 125000,
        timeLeft: '3 zile',
        description: 'Excavator JCB 3CX Backhoe Loader, an 2019, 2500 ore de funcționare, dotări complete. Mașina este în stare excelentă, service la reprezentanță, întreținere corectă. Include găleată și alte accesorii.',
        seller: 'Firmă Construcții',
        condition: 'Excelentă',
        year: '2019',
        location: 'Timișoara',
        shipping: 'Transport disponibil',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: 'Nu se aplică',
        warranty: '3 luni garanție',
        category: 'utilaje',
        subcategory: 'utilaje-constructii',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Artă & Antichități - Picturi
      {
        id: 'real-auction-5',
        title: 'Pictură ulei pe pânză, artist român contemporan',
        image: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 8500,
        timeLeft: '1 zi',
        description: 'Pictură originală în ulei pe pânză, semnată de artist român cunoscut. Dimensiuni 80x100 cm, în ramă elegantă din lemn. Pictura reprezintă un peisaj montan din Carpați. Certificat de autenticitate inclus.',
        seller: 'Galerie Artă',
        condition: 'Excelentă',
        year: '2022',
        location: 'București',
        shipping: '15 Lei transport',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '7 zile retur',
        warranty: 'Certificat autenticitate',
        category: 'arta',
        subcategory: 'picturi',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        isTest: false
      },
      // Electronice & Tehnologie - Laptopuri
      {
        id: 'real-auction-6',
        title: 'Laptop ASUS ROG Strix G15, RTX 3060, 16GB RAM',
        image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 5200,
        timeLeft: '18h',
        description: 'Laptop gaming ASUS ROG Strix G15, procesor AMD Ryzen 7, placa video NVIDIA RTX 3060, 16GB RAM DDR4, SSD 512GB, ecran 15.6 inch Full HD 144Hz. Laptop în stare excelentă, folosit doar 6 luni, încutie completă, garanție până în 2025.',
        seller: 'Vânzător',
        condition: 'Excelentă',
        year: '2023',
        location: 'Iași',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Garanție până în 2025',
        category: 'electronice',
        subcategory: 'laptopuri-pc',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Casă & Grădină - Mobilier
      {
        id: 'real-auction-7',
        title: 'Set mobilier living modern, 5 piese, culoare bej',
        image: 'https://images.unsplash.com/photo-1581539250439-c96689b516dd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 4200,
        timeLeft: '5 zile',
        description: 'Set complet mobilier living modern din masă de lemn și material textil premium. Include: canapea 3+2 locuri, masă de cafea, 2 mese laterale, bibliotecă. Mobilier în stare foarte bună, folosit 2 ani, culoare bej neutru.',
        seller: 'Proprietar',
        condition: 'Foarte bună',
        year: '2022',
        location: 'Constanța',
        shipping: '150 Lei transport',
        paymentMethods: ['Card bancar', 'Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'casa',
        subcategory: 'mobilier-interior',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Modă & Lifestyle - Ceasuri
      {
        id: 'real-auction-8',
        title: 'Ceas Tissot Seastar 1000, cuarț, scufundare 300m',
        image: 'https://images.unsplash.com/photo-1594534475808-b18fc33b045e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 2800,
        timeLeft: '2 zile',
        description: 'Ceas Tissot Seastar 1000 Professional, mecanism cuarț, rezistent la apă până la 300m, cureaua originală din silicon, carcasă din oțel inox. Ceas în stare excelentă, cu cutie și certificat original, folosit ocazional.',
        seller: 'Colecționar',
        condition: 'Excelentă',
        year: '2021',
        location: 'București',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Fără garanție',
        category: 'moda',
        subcategory: 'ceasuri-lux',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        isTest: false
      },
      // Agricultură - Tractoare
      {
        id: 'real-auction-9',
        title: 'Tractor U650, 65CP, an 2018, 1200 ore',
        image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 18500,
        timeLeft: '7 zile',
        description: 'Tractor U650, 65CP, an 2018, doar 1200 ore de funcționare, în stare foarte bună. Include plug reversibil și cultivator. Mașina a fost folosită doar sezonier, întreținută corect, toate actele în regulă.',
        seller: 'Fermier',
        condition: 'Foarte bună',
        year: '2018',
        location: 'Dolj',
        shipping: 'Transport disponibil',
        paymentMethods: ['Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'agricultura',
        subcategory: 'tractoare-combine',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Business - Echipamente Birou
      {
        id: 'real-auction-10',
        title: 'Imprimantă multifuncțională HP LaserJet Pro, A3',
        image: 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 3200,
        timeLeft: '3 zile',
        description: 'Imprimantă HP LaserJet Pro M404dn, format A3, imprimare în alb-negru, viteza 38 pagini/minut, conectivitate Ethernet și USB. Imprimanta este în stare excelentă, folosită în birou, toate funcțiile testate.',
        seller: 'Companie',
        condition: 'Excelentă',
        year: '2022',
        location: 'București',
        shipping: '50 Lei transport',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '7 zile retur',
        warranty: 'Fără garanție',
        category: 'diverse',
        subcategory: 'echipamente-birou',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Materiale Construcții
      {
        id: 'real-auction-11',
        title: 'Lot plăci ceramice pentru baie și bucătărie, 45 mp',
        image: 'https://images.unsplash.com/photo-1631889993950-4ce46de00c9d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 1800,
        timeLeft: '4 zile',
        description: 'Lot complet plăci ceramice de calitate pentru baie și bucătărie, suprafață totală 45 mp. Include plăci perete și podea, diverse modele și culori, toate din același lot. Materiale noi, nefolosite, din stoc de licitație.',
        seller: 'Furnizor',
        condition: 'Nou',
        year: '2024',
        location: 'Prahova',
        shipping: 'Transport disponibil',
        paymentMethods: ['Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'materiale',
        subcategory: 'ciment-caramida',
        saleType: 'vanzare-directa',
        isTest: false
      },
      // Diverse - Colectii Private
      {
        id: 'real-auction-12',
        title: 'Colecție monede românești, 1950-1989, 150 piese',
        image: 'https://images.unsplash.com/photo-1615247001958-f4bc92fa6a81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 4500,
        timeLeft: '6 zile',
        description: 'Colecție valoroasă de monede românești din perioada 1950-1989, total 150 piese, în stare excelentă. Colecția include monede rare și obișnuite, toate catalogate și păstrate corespunzător. Ideal pentru colecționari.',
        seller: 'Colecționar',
        condition: 'Excelentă',
        year: 'Colectie',
        location: 'Galați',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Fără garanție',
        category: 'diverse',
        subcategory: 'colectii-private',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        isTest: false
      }
    ];

    return realAuctions;
  };

  // Generate real details-only products - one from each main category
  const generateRealDetailsOnlyProducts = () => {
    const detailsOnlyProducts = [
      // Imobiliare - Terenuri
      {
        id: 'details-product-1',
        title: 'Teren intravilan, 500 mp, zonă rezidențială, Cluj-Napoca',
        image: 'https://images.unsplash.com/photo-1596901856263-27cfb4a5ea4d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 95000,
        timeLeft: 'Informații',
        description: 'Teren intravilan de 500 mp, situat într-o zonă rezidențială bine dezvoltată din Cluj-Napoca. Terenul este rectangular, cu acces la utilități (apă, canalizare, electricitate, gaze), drum asfaltat. Perfect pentru construcție locuință sau investiție imobiliară. Acte în regulă, carte funciară clară.',
        seller: 'Proprietar',
        condition: 'Bună',
        year: '2024',
        location: 'Cluj-Napoca',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Transfer bancar', 'Credit ipotecar'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Garanție bună funcționare',
        category: 'imobiliare',
        subcategory: 'terenuri-intravilane',
        saleType: 'vanzare-directa',
        address: 'Str. Memorandumului nr. 85, Cluj-Napoca',
        coordinates: { lat: 46.7712, lng: 23.6236 },
        productType: 'details-only',
        isTest: false
      },
      // Autovehicule - SUV
      {
        id: 'details-product-2',
        title: 'Range Rover Evoque 2020, 2.0 TD4, 4x4, full options',
        image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 78000,
        timeLeft: 'Informații',
        description: 'Range Rover Evoque P250 R-Dynamic, an 2020, motor 2.0 benzina, 250CP, cutie automată 9 trepte ZF, tracțiune integrală. Full options: sistem audio Meridian, ACC, senzori 360°, camera spate, volan încălzit și ventilat, scaune încălzite în față și spate, panoramic roof. Un singur proprietar, service la reprezentanță, accidente zero.',
        seller: 'Salon Auto',
        condition: 'Excelentă',
        year: '2020',
        location: 'București',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Card bancar', 'Transfer bancar', 'Leasing'],
        returnPolicy: 'Nu se aplică',
        warranty: '6 luni garanție',
        category: 'autovehicule',
        subcategory: 'suv-4x4',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Executări Silite - Terenuri
      {
        id: 'details-product-3',
        title: 'Teren executare silită, 1500 mp, extravilan, Dolj',
        image: 'https://images.unsplash.com/photo-1596901856263-27cfb4a5ea4d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 45000,
        timeLeft: 'Informații',
        description: 'Teren extravilan de 1500 mp, executare silită prin instanță. Terenul este situat în județul Dolj, în zona rurală, acces drum de țară. Potențial pentru agricultură sau zootehnie. Acte de executare disponibile, necesita verificare în carte funciară.',
        seller: 'Executor Judecătoresc',
        condition: 'Bună',
        year: '2024',
        location: 'Dolj',
        shipping: 'Inspectare la fața locului',
        paymentMethods: ['Transfer bancar'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'executari',
        subcategory: 'exec-imobiliare',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        productType: 'details-only',
        isTest: false
      },
      // Utilaje - Utilaje Agricole
      {
        id: 'details-product-4',
        title: 'Combine de recoltat John Deere S660, 2017, 800 ore',
        image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 285000,
        timeLeft: 'Informații',
        description: 'Combine de recoltat John Deere S660, an 2017, doar 800 ore de funcționare, în stare excelentă. Mașina include cabina cu climatizare, sistem GPS, monitorare performanță. Service complet la reprezentanță, întreținere regulată. Ideal pentru ferme mari.',
        seller: 'Dealer Utilaje',
        condition: 'Excelentă',
        year: '2017',
        location: 'Iași',
        shipping: 'Transport disponibil',
        paymentMethods: ['Card bancar', 'Transfer bancar', 'Leasing'],
        returnPolicy: 'Nu se aplică',
        warranty: '6 luni garanție',
        category: 'utilaje',
        subcategory: 'utilaje-agricole',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Artă - Bijuterii
      {
        id: 'details-product-5',
        title: 'Set bijuterii de argint autentic, stil tradițional românesc',
        image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 3200,
        timeLeft: 'Informații',
        description: 'Set complet bijuterii din argint autentic, stil tradițional românesc. Include: colier, cercei, brățări, inele. Bijuteriile sunt lucrate manual de meșteri români, cu motive tradiționale autentice. Certificat de autenticitate, argint 925, stare excelentă.',
        seller: 'Atelier Meșteșug',
        condition: 'Excelentă',
        year: '2023',
        location: 'Brașov',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Certificat autenticitate',
        category: 'arta',
        subcategory: 'bijuterii',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Electronice - Telefoane
      {
        id: 'details-product-6',
        title: 'iPhone 15 Pro Max, 1TB, Titanium Natural, sigilat',
        image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 12500,
        timeLeft: 'Informații',
        description: 'iPhone 15 Pro Max, capacitate 1TB, culoare Titanium Natural, complet sigilat, nefolosit. Telefonul este în cutie originală, cu toate accesoriile (încărcător USB-C, cablu, documentație). Garanție oficială Apple până în 2025, activată. Preț negociabil pentru vânzare rapidă.',
        seller: 'Magazin Electronice',
        condition: 'Nou',
        year: '2024',
        location: 'București',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Garanție Apple până în 2025',
        category: 'electronice',
        subcategory: 'telefoane',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Casă & Grădină - Echipamente Grădinărit
      {
        id: 'details-product-7',
        title: 'Tractor de grădină Kubota BX2380, 23CP, cu accesorii',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 18500,
        timeLeft: 'Informații',
        description: 'Tractor de grădină Kubota BX2380, motor diesel 23CP, 4x4, cutie hidrostatică. Include accesorii: cositoare frontală, plug reversibil, cultivator. Tractor în stare excelentă, folosit ocazional, întreținut perfect. Ideal pentru proprietăți rurale sau terenuri mari.',
        seller: 'Vânzător',
        condition: 'Foarte bună',
        year: '2021',
        location: 'Prahova',
        shipping: 'Transport disponibil',
        paymentMethods: ['Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'casa',
        subcategory: 'echipamente-gradinarit',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Modă - Genți & Accesorii
      {
        id: 'details-product-8',
        title: 'Geantă Louis Vuitton Neverfull MM, autentică, 2022',
        image: 'https://images.unsplash.com/photo-1594633313593-bab3825d0c1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 9800,
        timeLeft: 'Informații',
        description: 'Geantă Louis Vuitton Neverfull MM, monogram clasic, autentică, an 2022. Geanta este în stare excelentă, folosită ocazional, cu toate accesoriile originale (punguță interior, cheițe). Certificat de autenticitate inclus. Perfect pentru colecționare sau utilizare zilnică.',
        seller: 'Boutique Lux',
        condition: 'Excelentă',
        year: '2022',
        location: 'București',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '7 zile retur',
        warranty: 'Certificat autenticitate',
        category: 'moda',
        subcategory: 'genti-accesorii',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Agricultură - Animale
      {
        id: 'details-product-9',
        title: 'Lot vaci laptiere Holstein, 25 capete, acte complete',
        image: 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 95000,
        timeLeft: 'Informații',
        description: 'Lot de 25 vaci laptiere de rasă Holstein, vârstă medie 4-6 ani, producție medie 25-30 litri/lactație. Toate animalele sunt în stare bună de sănătate, vaccinate, cu acte complete. Ideal pentru ferme zootehnice sau investiție în agricultură. Negociabil pe lot sau individual.',
        seller: 'Fermier',
        condition: 'Bună',
        year: '2024',
        location: 'Iași',
        shipping: 'Transport disponibil',
        paymentMethods: ['Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'agricultura',
        subcategory: 'animale',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Business - Mobilier Comercial
      {
        id: 'details-product-10',
        title: 'Mobilier comercial complet pentru restaurant, 50 locuri',
        image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 12500,
        timeLeft: 'Informații',
        description: 'Set complet mobilier comercial pentru restaurant: mese rotunde și dreptunghiulare pentru 50 locuri, scaune tapitate, bufet bar, vitrine pentru expunere, tăvi și accesorii. Mobilier în stare foarte bună, folosit 3 ani, culoare neutră, ușor de adaptat la orice tematică.',
        seller: 'Restaurant',
        condition: 'Foarte bună',
        year: '2021',
        location: 'Constanța',
        shipping: '300 Lei transport',
        paymentMethods: ['Card bancar', 'Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'diverse',
        subcategory: 'mobilier-comercial',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Materiale - Feronerie
      {
        id: 'details-product-11',
        title: 'Lot fier beton, profile I, șipci, diverse dimensiuni',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 8500,
        timeLeft: 'Informații',
        description: 'Lot mare fier beton și profile metalice pentru construcții: bare de armare diverse diametre, profile I, șipci metalice, plase sudate. Materiale noi, din stoc de licitație, etichetate și catalogate. Ideal pentru proiecte de construcții sau depozit.',
        seller: 'Depozit Materiale',
        condition: 'Nou',
        year: '2024',
        location: 'Timișoara',
        shipping: 'Transport disponibil',
        paymentMethods: ['Transfer bancar', 'Cash'],
        returnPolicy: 'Nu se aplică',
        warranty: 'Fără garanție',
        category: 'materiale',
        subcategory: 'feronerie-unelte',
        saleType: 'vanzare-directa',
        productType: 'details-only',
        isTest: false
      },
      // Diverse - Militare/Historice
      {
        id: 'details-product-12',
        title: 'Colecție obiecte militare istorice românești, 20 piese',
        image: 'https://images.unsplash.com/photo-1607464881239-76873ca248f3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        currentBid: 12500,
        timeLeft: 'Informații',
        description: 'Colecție valoroasă de obiecte militare istorice românești: decorații, medali, insignă, documente, fotografii. Total 20 piese autentice din perioada 1914-1945, toate catalogate și documentate. Colecția include și documente oficiale originale. Ideal pentru muzeu sau colecționar specializat.',
        seller: 'Colecționar',
        condition: 'Excelentă',
        year: 'Colectie',
        location: 'București',
        shipping: 'Gratuit în România',
        paymentMethods: ['Card bancar', 'Transfer bancar'],
        returnPolicy: '14 zile retur',
        warranty: 'Certificat autenticitate',
        category: 'diverse',
        subcategory: 'militare-istorice',
        saleType: 'licitatie-publica',
        auctionDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        productType: 'details-only',
        isTest: false
      }
    ];

    return detailsOnlyProducts;
  };

  // Folosește produsele reale din Supabase dacă există, altfel folosește produsele fictive
  // Memoized to prevent regeneration on every render
  const staticAuctions = useMemo(() => realProducts.length > 0 ? [] : generateRealAuctions(), [realProducts.length]);
  const staticDetailsOnly = useMemo(() => realProducts.length > 0 ? [] : generateRealDetailsOnlyProducts(), [realProducts.length]);

  // Grila principală folosește doar rezultatele exacte. Rezultatele relaxate sunt afișate separat, etichetat.
  const auctions = useMemo(() => {
    if (realProducts.length > 0) return realProducts.map(convertProductToAuction);
    if (filtersSignatureFromUrl) return [];
    return [
      ...staticAuctions,
      ...staticDetailsOnly,
      ...productsFromStorage.map(convertProductToAuction),
    ];
  }, [
    realProducts,
    productsFromStorage,
    staticAuctions,
    staticDetailsOnly,
    filtersSignatureFromUrl,
  ]);

  // Executări: opțiuni pentru "Mai multe detalii" = lista canonică (mereu vizibilă) + eventuale valori din date
  const executariListCategoryOptions = useMemo(() => {
    const canonical = [...EXEC_MAI_MULTE_DETALII_OPTIONS];
    const isInsolventa = (a: any) => a.productType === 'licitatii-publice' || a.saleType === 'licitatii-insolventa' || a.saleType === 'licitatie-publica';
    const fromExecutari = auctions.filter(isInsolventa);
    const fromData = new Set<string>();
    if (selectedExecutariMainCategory) {
      const main = selectedExecutariMainCategory;
      const filtered = fromExecutari.filter((a: any) => ((a.main_category || a.category || '').toString().trim() === main));
      filtered.forEach((a: any) => {
        const c = (a.list_category || '').toString().trim();
        if (c) fromData.add(c);
      });
    } else {
      fromExecutari.forEach((a: any) => {
        const c = (a.list_category || '').toString().trim();
        if (c) fromData.add(c);
      });
    }
    const canonicalSet = new Set<string>(canonical);
    const extra = Array.from(fromData).filter((c) => !canonicalSet.has(c)).sort((a, b) => a.localeCompare(b));
    return [...canonical, ...extra];
  }, [auctions, selectedExecutariMainCategory]);

  // Fallback ladder: secțiuni progresive – exact → brand+model → brand → subcategorie → categorie; fiecare cu bar "Te-ar putea interesa"
  const ladderBase = useMemo(() => {
    const hasStrictCategoryFilter =
      selectedCategory !== "all" ||
      selectedCategories.length > 0 ||
      selectedSubcategory !== "all" ||
      selectedSubcategories.length > 0;
    const noLadder =
      imageSearchProductIds !== null ||
      hasStrictCategoryFilter ||
      (!(searchParams?.get?.("q") ?? "").trim() && selectedCategory === "all" && (!location || location === "all"));
    if (noLadder) {
      return {
        results: auctions,
        reasonFlags: { locationExpanded: false, categoryExpanded: false, termsReduced: false } as ReasonFlags,
        effectiveCategory: selectedCategory,
        effectiveSubcategory: selectedSubcategory,
        sections: [] as LadderSection<any>[],
      };
    }
    const searchQ = (searchParams?.get?.("q") ?? "").trim();
    const filters = {
      location: location || "all",
      categoryKey: selectedCategory,
      subcategoryKey: selectedSubcategory,
      query: searchQ,
      allSearchTerms: searchAnalysis?.allSearchTerms,
    };
    const scenarios = buildScenarios(filters);
    const assignedIds = new Set<string>();
    const sections: LadderSection<any>[] = [];
    for (const sc of scenarios) {
      const items = auctions.filter(
        (a) => !assignedIds.has(String(a.id)) && auctionMatchesScenario(a, sc, location || "all")
      );
      items.forEach((a) => assignedIds.add(String(a.id)));
      if (items.length > 0) {
        sections.push({
          scenario: sc,
          label: getScenarioSectionLabel(sc, filters),
          items,
        });
      }
    }
    const first = sections[0];
    const results = sections.flatMap((s) => s.items);
    return {
      results: results.length > 0 ? results : auctions,
      reasonFlags: first?.scenario.reasonFlags ?? { locationExpanded: false, categoryExpanded: false, termsReduced: false },
      effectiveCategory: first?.scenario.categoryKey ?? selectedCategory,
      effectiveSubcategory: first?.scenario.subcategoryKey ?? selectedSubcategory,
      sections,
    };
  }, [auctions, imageSearchProductIds, searchParams?.get?.("q"), selectedCategory, selectedCategories, selectedSubcategory, selectedSubcategories, location, searchAnalysis?.allSearchTerms]);

  // Breakpoint listă + mounted: 24 desktop / 18 mobil (fără `limit` în URL).
  // Folosim useEffect pentru a păstra primul render client identic cu SSR și a evita hydration mismatch.
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (process.env.NEXT_PUBLIC_ENABLE_RO_LISTINGS_SW === "1" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw-ro-listings.js").catch(() => {});
    }
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setViewportIsMdUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const autoLocationAttemptedRef = useRef(false);
  useEffect(() => {
    if (!mounted || autoLocationAttemptedRef.current || typeof window === "undefined") return;
    autoLocationAttemptedRef.current = true;

    const enabled = localStorage.getItem(RO_AUTO_LOCATION_ENABLED_KEY) === "1";
    const params = new URLSearchParams(window.location.search);
    const hasUrlLocation = Boolean((params.get("location") || params.get("locations") || params.get("city") || "").trim());
    if (!enabled) {
      const promptSeen = localStorage.getItem(RO_LOCATION_PROMPT_SEEN_KEY) === "1";
      if (!promptSeen && !hasUrlLocation) {
        setLocationPermissionModalOpen(true);
      }
      return;
    }

    if (hasUrlLocation) return;

    const stored = readStoredLocationCenter();
    if (stored) {
      applyStoredLocationCenter(stored);
    }

    if (!navigator.geolocation) return;

    const refreshGrantedLocation = () => {
      applyMyLocationCenter({ closeMobileSheet: false, automatic: true });
    };

    const permissionsApi = navigator.permissions;
    if (permissionsApi?.query) {
      void permissionsApi
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          // Important: only auto-refresh when already granted. If state is "prompt",
          // do not trigger the browser permission popup automatically.
          if (status.state === "granted") refreshGrantedLocation();
        })
        .catch(() => {
          // Permission API unavailable/blocked: keep the stored center, no prompt.
        });
      return;
    }

    // Browsers without Permissions API: use the stored center only, so we don't show
    // an automatic permission prompt again.
  }, [applyMyLocationCenter, applyStoredLocationCenter, mounted]);

  // Detect mobile for banner popup
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Hint marcă Search fin: „OK am înțeles” — încarcă din storage; la login/logout reîncarcă
  useEffect(() => {
    if (!mounted) return;
    void refreshSearchFinHintDismissed();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refreshSearchFinHintDismissed();
    });
    return () => subscription.unsubscribe();
  }, [mounted, refreshSearchFinHintDismissed]);

  // Load dark mode and filter button position from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, []);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Premium logic:
  // - badge PREMIUM only when isPremium=true
  // - prioritize premium, but cap at max 8 premium consecutively (when possible)
  function isPremiumAuction(auction: any): boolean {
    return Boolean((auction as any)?.isPremium ?? (auction as any)?.is_premium ?? false);
  }

  function distributePremiumAuctions<T>(items: T[], pageSize = RO_LISTINGS_PAGE_SIZE_DESKTOP, premiumPerPage = 6): T[] {
    const premium = items.filter((it) => isPremiumAuction(it as any));
    const regular = items.filter((it) => !isPremiumAuction(it as any));

    // If we only have premium (or only regular), return as-is
    if (premium.length === 0 || regular.length === 0) return items;

    const out: T[] = [];
    let p = 0;
    let r = 0;

    while (p < premium.length || r < regular.length) {
      const page: T[] = [];

      // First 6 items in each 24-batch are premium (when available)
      let addedPremium = 0;
      while (p < premium.length && addedPremium < premiumPerPage && page.length < pageSize) {
        page.push(premium[p++]);
        addedPremium++;
      }

      // Fill the rest of the page with regular (or premium if regular runs out)
      while (page.length < pageSize && (r < regular.length || p < premium.length)) {
        if (r < regular.length) page.push(regular[r++]);
        else if (p < premium.length) page.push(premium[p++]);
      }

      if (page.length === 0) break;
      out.push(...page);
    }

    return out;
  }

  /** Verifică dacă un auction se potrivește cu o locație selectată (oraș/județ) – folosit la filtre */
  const auctionMatchesLocation = (auction: { city?: string; county?: string; location?: string }, selectedLoc: string): boolean => {
    if (!selectedLoc?.trim()) return true;
    const norm = normalizeForSearch(selectedLoc.trim());
    const aCity = normalizeForSearch(String(auction.city ?? '').trim());
    const aCounty = normalizeForSearch(String(auction.county ?? '').trim());
    const aLoc = normalizeForSearch(String(auction.location ?? '').trim());
    return aCity === norm || aCounty === norm || aCity.includes(norm) || aCounty.includes(norm) || aLoc.includes(norm);
  };

  // Store initial order to keep it stable until page refresh
  useEffect(() => {
    if (auctions.length > 0 && initialOrder.size === 0) {
      const searchQ = (searchParams?.get?.('q') ?? '').toLowerCase().trim();
      const filtered = auctions.filter(auction => {
        if (imageSearchProductIds !== null && imageSearchProductIds.length === 0) return false;
        if (searchQ && !auctionMatchesSearchQTokens(searchQ, auction, { queryTitleOnly: searchQTitleOnly, categoryScope: selectedCategory !== 'all' })) {
          return false;
        }
        const aucCat = (auction.category || '').toString().toLowerCase();
        const selCatKey = selectedCategory.toLowerCase();
        const selCatName = (categories[selectedCategory as keyof typeof categories]?.name || '').toString().toLowerCase();
        if (selectedCategory !== 'all' && aucCat !== selCatKey && !(selCatName && aucCat === selCatName)) return false;
        const aucSubKey = normalizeSubcategoryToKey((auction.subcategory || '').toString(), filterSchema.subcategoryNames);
        if (selectedSubcategories.length > 1) {
          if (!selectedSubcategories.includes(aucSubKey)) return false;
        } else if (selectedSubcategory !== 'all' && aucSubKey !== selectedSubcategory) return false;
        const displayPrice = getAuctionDisplayPriceInSelectedCurrency(auction as any, selectedCurrency);
        if (priceRange.min && displayPrice < parseFloat(priceRange.min)) return false;
        if (priceRange.max && displayPrice > parseFloat(priceRange.max)) return false;
        /** Centru geo valid = sortare după distanță (cu sau fără rază). Nu mai filtra strict pe text oraș — altfel dispar toate anunțurile din afara localității. */
        const listingsGeoCenterActive =
          nearLat != null &&
          nearLng != null &&
          Number.isFinite(nearLat) &&
          Number.isFinite(nearLng);
        if (!listingsGeoCenterActive && !(auction as { __fromRelaxedGeo?: boolean }).__fromRelaxedGeo) {
          if (selectedLocations.length > 1 && !selectedLocations.some((loc) => auctionMatchesLocation(auction, loc))) return false;
          if (selectedLocations.length <= 1 && location !== 'all' && !auctionMatchesLocation(auction, location)) return false;
        }
        if (!auctionMatchesConditionFilter(auction.condition, selectedSubcategory, condition, selectedConditions)) return false;
        if (selectedSubcategory === 'piese-auto') {
          if (selectedPieseTipSlugs.length > 0) {
            const auctionL3 = (auction as any).categoryLevel3 || '';
            if (!auctionMatchesAnyPieseTipSlug(auctionL3, selectedPieseTipSlugs)) return false;
          }
        } else if (selectedLevel3 !== 'all') {
          const auctionL3 = (auction as any).categoryLevel3 || '';
          if (auctionL3 !== selectedLevel3) return false;
        }
        return true;
      });
      const primary = searchAnalysis?.primaryTerm?.toLowerCase() ?? searchQ;
      const sorted = filtered.sort((a, b) => {
        if (searchQ && primary) {
          const aHasPrimary = (a.title ?? '').toLowerCase().includes(primary);
          const bHasPrimary = (b.title ?? '').toLowerCase().includes(primary);
          if (aHasPrimary !== bHasPrimary) return aHasPrimary ? -1 : 1;
        }
        const displayA = getAuctionDisplayPriceInSelectedCurrency(a as any, selectedCurrency);
        const displayB = getAuctionDisplayPriceInSelectedCurrency(b as any, selectedCurrency);
        const newestTsA = new Date((a as any).createdAt || (a as any).created_at || (a as any).auctionDate || 0).getTime() || 0;
        const newestTsB = new Date((b as any).createdAt || (b as any).created_at || (b as any).auctionDate || 0).getTime() || 0;
        switch (sortBy) {
          case 'relevant':
            return 0; // păstrează ordinea naturală (relevanță)
          case 'newest':
            return newestTsB - newestTsA;
          case 'oldest':
            return newestTsA - newestTsB;
          case 'timeLeft':
            return a.timeLeft.localeCompare(b.timeLeft);
          case 'priceLow':
            return displayA - displayB;
          case 'priceHigh':
            return displayB - displayA;
          case 'title':
            return a.title.localeCompare(b.title);
          default:
            return 0;
        }
      });
      const order = new Map<string, number>();
      sorted.forEach((auction, index) => order.set(auction.id, index));
      setInitialOrder(order);
    }
  }, [auctions.length, initialOrder.size, searchParams?.get?.('q'), searchParams?.get?.('brand'), searchQTitleOnly, searchAnalysis, selectedCurrency, selectedLevel3, selectedPieseTipSlugs, selectedSubcategory, selectedCategory, selectedSubcategories, condition, selectedConditions, location, selectedLocations, priceRange.min, priceRange.max, locationRadiusKm, nearLat, nearLng]);

  // Filter and sort functions - memoized to prevent reordering when favorites change (operates on ladder results)
  const { filteredFull, filteredMinimal, filteredSupplementary, filteredSections } = useMemo(() => {
    const listToFilter = ladderBase.results;
    const effectiveCategory = ladderBase.effectiveCategory ?? selectedCategory;
    const effectiveSubcategory = ladderBase.effectiveSubcategory ?? selectedSubcategory;
    const passesFilter = (auction: any, minimalMode: boolean, overrideCategory?: string, overrideSubcategory?: string): boolean => {
      const effCat = overrideCategory ?? effectiveCategory;
      const effSub = overrideSubcategory ?? effectiveSubcategory;
      // Image search filter - dacă există căutare după imagine, arată doar produsele cu imaginea exactă
      if (imageSearchProductIds !== null) {
        // Dacă nu există produse găsite, filtrează tot (nu arată nimic)
        if (imageSearchProductIds.length === 0) {
          return false;
        }

        // Folosim productDbId dacă există (ID-ul original din baza de date)
        const productDbId = (auction as any).productDbId;

        if (productDbId && imageSearchProductIds) {
          // Comparăm direct cu ID-ul din baza de date (trebuie să fie exact match)
          const matchesImageSearch = imageSearchProductIds.some((id: string) => {
            // Support both UUID format and string comparison
            return id === productDbId ||
              String(id) === String(productDbId) ||
              id?.toLowerCase() === productDbId?.toLowerCase();
          });

          if (!matchesImageSearch) {
            return false;
          }
        } else if (imageSearchProductIds && imageSearchProductIds.length > 0) {
          // Dacă nu avem productDbId, încercăm să găsim produsul în realProducts
          const auctionId = auction.id;
          const matchingProduct = realProducts.find((p: any) => {
            const productSlug = p.slug;
            const productId = p.id;
            const productIdFormatted = `product-${p.id}`;

            return auctionId === productSlug ||
              auctionId === productId ||
              auctionId === productIdFormatted ||
              (typeof auctionId === 'string' && auctionId.includes(productId));
          });

          if (matchingProduct) {
            const matchesImageSearch = imageSearchProductIds.includes(matchingProduct.id);
            if (!matchesImageSearch) {
              return false;
            }
          } else {
            // Dacă nu am găsit produsul, comparăm direct cu auctionId
            const matchesImageSearch = imageSearchProductIds.some(searchId => {
              return searchId === auctionId ||
                auctionId === `product-${searchId}` ||
                (auctionId && typeof auctionId === 'string' && auctionId.includes(searchId));
            });

            if (!matchesImageSearch) {
              return false;
            }
          }
        }
      }

      // Căutare după ?q= – folosește termeni înrudiți, matching fără diacritice (casa = casă)
      const searchQ = (searchParams?.get?.('q') ?? '').toLowerCase().trim();
      if (searchQ && !auctionMatchesSearchQTokens(searchQ, auction, { queryTitleOnly: searchQTitleOnly, categoryScope: effCat !== 'all' })) {
        return false;
      }

      // Category filter – suportă selecție multiplă (OR) prin `selectedCategories`.
      const auctionCatNorm = normalizeForSearch(auction.category || '');
      const isFromInsolventa = (auction as any).productType === 'licitatii-publice' || (auction as any).saleType === 'licitatii-insolventa' || (auction as any).saleType === 'licitatie-publica';
      const deriveExecutariLinkedCategory = (): string => {
        const subKey = normalizeSubcategoryToKey((auction.subcategory || '').toString(), filterSchema.subcategoryNames);
        const mainText = normalizeForSearch(((auction as any).main_category || '').toString());
        const listText = normalizeForSearch(((auction as any).list_category || '').toString());
        const full = `${subKey} ${mainText} ${listText}`;
        if (subKey === 'exec-imobiliare' || /\b(imobil|apartament|casa|teren|spatiu)\b/.test(full)) return 'imobiliare';
        if (subKey === 'exec-autovehicule' || /\b(auto|autoturism|vehicul|camion|motocic)\b/.test(full)) return 'autovehicule';
        if (subKey === 'exec-industrial' || /\b(utilaj|industrial|echipament|tractor|excavator)\b/.test(full)) return 'utilaje';
        if (subKey === 'exec-afaceri' || subKey === 'exec-office' || /\b(afaceri|office|stoc|firma|lichidare)\b/.test(full)) return 'business';
        return 'diverse';
      };
      const matchesCategoryKey = (categoryKey: string): boolean => {
        const catKey = categoryKey.toLowerCase();
        if (isFromInsolventa && !includeExecutariCrosslist && catKey !== 'executari') {
          return false;
        }
        const catKeyNorm = normalizeForSearch(catKey);
        const catName = (categories[categoryKey as keyof typeof categories]?.name || '').toString().toLowerCase();
        const catNameNorm = catName ? normalizeForSearch(catName) : '';
        let singleMatch = catKey === 'all' || auctionCatNorm === catKeyNorm || Boolean(catNameNorm && auctionCatNorm === catNameNorm);

        if (!singleMatch && includeExecutariCrosslist && isFromInsolventa && catKey !== 'executari') {
          const derived = deriveExecutariLinkedCategory();
          if (derived === catKeyNorm) singleMatch = true;
        } else if (catKey === 'executari' && !singleMatch && isFromInsolventa) {
          singleMatch = true;
        }
        return singleMatch;
      };
      const hasMultiCategorySelection = !overrideCategory && selectedCategories.length > 1;
      const categoryMatch = hasMultiCategorySelection
        ? selectedCategories.some((c) => matchesCategoryKey(c))
        : matchesCategoryKey(effCat);
      if (!categoryMatch) return false;

      // Subcategory logic
      const auctionSubKey = normalizeSubcategoryToKey((auction.subcategory || '').toString(), filterSchema.subcategoryNames);

      // Executări și Insolvență: filtrare după Cat. principală (main_category) + Categorie (list_category)
      if (!hasMultiCategorySelection && effCat === 'executari') {
        if (selectedExecutariMainCategory) {
          const aucMain = ((auction as any).main_category || auction.category || '').toString().trim();
          if (aucMain !== selectedExecutariMainCategory) return false;
        }
        if (activeSelectedExecutariListCategories.length > 0) {
          const aucList = ((auction as any).list_category || '').toString().trim();
          if (!activeSelectedExecutariListCategories.includes(aucList)) return false;
        }
        const hasMultiSubcategorySelection = selectedSubcategories.length > 1;
        const subcategoryMatch = hasMultiSubcategorySelection
          ? selectedSubcategories.includes(auctionSubKey)
          : (effSub === 'all' || auctionSubKey === effSub);
        if (!subcategoryMatch) return false;
      } else if (!hasMultiCategorySelection) {
        // Subcategory filter pentru celelalte categorii, cu mapping pentru cross-listate
        const hasMultiSubcategorySelection = selectedSubcategories.length > 1;
        let subcategoryMatch = hasMultiSubcategorySelection
          ? selectedSubcategories.includes(auctionSubKey)
          : (effSub === 'all' || auctionSubKey === effSub);

        const isBlendedType =
          (includeExecutariCrosslist && isFromInsolventa) ||
          auction.productType === 'live-bid' ||
          auction.productType === 'buy-now' ||
          (auction as any).saleType === 'vanzare-directa';

        if (!subcategoryMatch && isBlendedType) {
          const listCategoryNorm = normalizeForSearch((((auction as any).list_category ?? "") as string).toString());
          const matchesExecImobiliareBySubcategory = (sub: string): boolean => {
            if (!listCategoryNorm) return false;
            if (sub === "apartamente") return /\b(apart|garson)\b/.test(listCategoryNorm);
            if (sub === "case-vile") return /\b(casa|vila)\b/.test(listCategoryNorm);
            if (sub === "spatii-comerciale") return /\b(spatiu|comercial|hala)\b/.test(listCategoryNorm);
            if (["terenuri", "terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole"].includes(sub)) {
              return /\bteren\b/.test(listCategoryNorm);
            }
            return false;
          };

          if (auctionSubKey === "exec-imobiliare") {
            if (hasMultiSubcategorySelection) {
              subcategoryMatch = selectedSubcategories.some((sub) => matchesExecImobiliareBySubcategory(sub));
            } else {
              subcategoryMatch = matchesExecImobiliareBySubcategory(effSub);
            }
          }

          const execMap: Record<string, string[]> = {
            "apartamente": ["exec-imobiliare"],
            "case-vile": ["exec-imobiliare"],
            "terenuri": ["exec-imobiliare", "terenuri", "terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole"],
            "terenuri-intravilane": ["exec-imobiliare"],
            "terenuri-extravilane": ["exec-imobiliare"],
            "terenuri-agricole": ["exec-imobiliare"],
            "spatii-comerciale": ["exec-imobiliare"],
            "autoturisme": ["exec-autovehicule", "piese-auto"],
            "suv-4x4": ["exec-autovehicule", "piese-auto"],
            "motociclete": ["exec-autovehicule", "piese-auto"],
            "camioane": ["exec-autovehicule", "piese-auto"],
            "remorci": ["exec-autovehicule", "piese-auto"],
            "vehicule-electrice": ["exec-autovehicule", "piese-auto"],
            "piese-auto": ["piese-auto"],
            "utilaje-constructii": ["exec-industrial"],
            "utilaje-agricole": ["exec-industrial"],
            "echipamente-forestiere": ["exec-industrial"],
            "echipamente-birou": ["exec-office", "exec-afaceri"],
            "mobilier-comercial": ["exec-afaceri"]
          };

          if (!subcategoryMatch) {
            if (hasMultiSubcategorySelection) {
              // If any of the selected subcategories is a parent for the auction's exec subcategory
              subcategoryMatch = selectedSubcategories.some(sub => execMap[sub]?.includes(auctionSubKey));
            } else {
              if (effSub === "terenuri") {
                subcategoryMatch = ["terenuri", "terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole", ...execMap["terenuri"] || []].includes(auctionSubKey);
              } else {
                subcategoryMatch = execMap[effSub]?.includes(auctionSubKey) || false;
              }
            }
          }
        }
        if (!subcategoryMatch) return false;
      }

      // Level 3 (piese-auto: multi tip piesă; altfel: un singur level3)
      if (effSub === 'piese-auto') {
        if (selectedPieseTipSlugs.length > 0) {
          const auctionL3 = (auction as any).categoryLevel3 || '';
          if (!auctionMatchesAnyPieseTipSlug(auctionL3, selectedPieseTipSlugs)) return false;
        }
      } else if (selectedLevel3 !== 'all') {
        const auctionL3 = (auction as any).categoryLevel3 || '';
        if (auctionL3 !== selectedLevel3) return false;
      }

      if (minimalMode) return true;

      // Size filter (XS, S, M, L, XL etc.)
      if (selectedSizes.length > 1) {
        const auctionSize = (auction as any).size || '';
        if (!selectedSizes.includes(auctionSize)) return false;
      } else if (selectedSize !== 'all') {
        const auctionSize = (auction as any).size || '';
        if (auctionSize !== selectedSize) return false;
      }

      // Brand filter (case-insensitive: URL brand=bmw trebuie să potrivească produse cu brand "BMW")
      if (selectedBrands.length > 1) {
        const auctionBrand = ((auction as any).brand || '').toString().trim().toLowerCase();
        const selectedBrandValues = selectedBrands.map((b) => b.trim().toLowerCase());
        if (!selectedBrandValues.includes(auctionBrand)) return false;
      } else if (selectedBrand !== 'all') {
        const auctionBrand = ((auction as any).brand || '').toString().trim().toLowerCase();
        const selBrand = selectedBrand.trim().toLowerCase();
        if (auctionBrand !== selBrand) return false;
      }

      // Model nu este folosit aici: filtrarea după model nu e suportată server-side, URL poate conține model= dar nu afectează lista.

      // Color filter (nu pentru piese auto – culoarea nu e relevantă)
      if (selectedSubcategory !== 'piese-auto') {
        if (selectedColors.length > 1) {
          const auctionColor = ((auction as any).color || '').toString().trim();
          if (!selectedColors.includes(auctionColor)) return false;
        } else if (selectedColor !== 'all') {
          const auctionColor = (auction as any).color || '';
          if (auctionColor !== selectedColor) return false;
        }
      }

      // Filtre detaliate (an, kilometraj, combustibil, transmisie) – brand/model/culoare sunt doar în lista principală
      const subKey = (auction.subcategory || '').toLowerCase().replace(/\s+/g, '-');
      const isAutoOrVehicle = selectedSubcategory === 'exec-autovehicule' || ['autoturisme', 'suv-4x4', 'motociclete', 'camioane', 'remorci', 'autorulote', 'vehicule-electrice', 'piese-auto'].some(s => subKey.includes(s));
      const isPhoneOrTablet = ['telefoane', 'tablete', 'telefoane-mobile'].some(s => subKey.includes(s));
      if ((isAutoOrVehicle || isPhoneOrTablet) && selectedSubcategory !== 'piese-auto') {
        if (detailedFilters.year?.min) {
          const y = parseInt((auction as any).year || '0', 10);
          if (isNaN(y) || y < parseFloat(detailedFilters.year.min)) return false;
        }
        if (detailedFilters.year?.max) {
          const y = parseInt((auction as any).year || '0', 10);
          if (isNaN(y) || y > parseFloat(detailedFilters.year.max)) return false;
        }
        if (detailedFilters.mileage?.min || detailedFilters.mileage?.max) {
          const km = parseInt((auction as any).mileage || '0', 10);
          if (detailedFilters.mileage?.min && (isNaN(km) || km < parseFloat(detailedFilters.mileage.min))) return false;
          if (detailedFilters.mileage?.max && (isNaN(km) || km > parseFloat(detailedFilters.mileage.max))) return false;
        }
        if (detailedFilters.capacitateCilindrica?.min) {
          const cap = parseInt((auction as any).capacitateCilindrica || (auction as any).capacitate_cilindrica || '0', 10);
          if (isNaN(cap) || cap < parseFloat(detailedFilters.capacitateCilindrica.min)) return false;
        }
        if (detailedFilters.capacitateCilindrica?.max) {
          const cap = parseInt((auction as any).capacitateCilindrica || (auction as any).capacitate_cilindrica || '0', 10);
          if (isNaN(cap) || cap > parseFloat(detailedFilters.capacitateCilindrica.max)) return false;
        }
        if (detailedFilters.fuelType?.trim()) {
          const auctionFuel = (auction as any).fuelType || '';
          if (auctionFuel.toLowerCase().trim() !== detailedFilters.fuelType.trim().toLowerCase()) return false;
        }
        if (detailedFilters.transmission?.trim()) {
          const auctionTrans = (auction as any).transmission || '';
          if (auctionTrans.toLowerCase().trim() !== detailedFilters.transmission.trim().toLowerCase()) return false;
        }
      }

      // Filtre detaliate Imobiliare - Apartamente (+ exec-imobiliare, + imobiliare/all)
      const isApartamente = selectedCategory === 'imobiliare' && (selectedSubcategory === 'apartamente' || selectedSubcategory === 'exec-imobiliare' || selectedSubcategory === 'all');
      if (isApartamente) {
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? '').toString().trim();
          if (detailedFilters.rooms === '5+') {
            if (auctionRooms && parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms !== detailedFilters.rooms) return false;
        }
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (isNaN(s) || s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (isNaN(s) || s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.floor?.min) {
          const f = parseFloat(((auction as any).floor ?? '').toString().replace(/\D/g, '') || '0');
          if (isNaN(f) || f < parseFloat(detailedFilters.floor.min)) return false;
        }
        if (detailedFilters.floor?.max) {
          const f = parseFloat(((auction as any).floor ?? '').toString().replace(/\D/g, '') || '0');
          if (isNaN(f) || f > parseFloat(detailedFilters.floor.max)) return false;
        }
        if (detailedFilters.buildingYear?.min) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? '0', 10);
          if (isNaN(y) || y < parseFloat(detailedFilters.buildingYear.min)) return false;
        }
        if (detailedFilters.buildingYear?.max) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? '0', 10);
          if (isNaN(y) || y > parseFloat(detailedFilters.buildingYear.max)) return false;
        }
      }

      // Filtre detaliate Imobiliare - Case și vile (+ exec-imobiliare, + imobiliare/all)
      const isCaseVile = selectedCategory === 'imobiliare' && (selectedSubcategory === 'case-vile' || selectedSubcategory === 'exec-imobiliare' || selectedSubcategory === 'all');
      if (isCaseVile) {
        if (detailedFilters.landSurface?.min) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? '').toString());
          if (isNaN(ls) || ls < parseFloat(detailedFilters.landSurface.min)) return false;
        }
        if (detailedFilters.landSurface?.max) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? '').toString());
          if (isNaN(ls) || ls > parseFloat(detailedFilters.landSurface.max)) return false;
        }
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? '').toString().trim();
          if (auctionRooms && detailedFilters.rooms === '5+') {
            if (parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms && auctionRooms !== detailedFilters.rooms) return false;
        }
        if (detailedFilters.garden) {
          const hasGarden = (auction as any).gradina === true;
          const desc = ((auction as any).description ?? '').toLowerCase();
          if (!hasGarden && !desc.includes('grădină') && !desc.includes('gradina') && !desc.includes('curte')) return false;
        }
        if (detailedFilters.garage) {
          const hasGarage = (auction as any).garaj === true;
          const desc = ((auction as any).description ?? '').toLowerCase();
          if (!hasGarage && !desc.includes('garaj') && !desc.includes('garage')) return false;
        }
        if (detailedFilters.pool) {
          const hasPool = (auction as any).piscina === true;
          const desc = ((auction as any).description ?? '').toLowerCase();
          if (!hasPool && !desc.includes('piscină') && !desc.includes('piscina') && !desc.includes('pool')) return false;
        }
      }

      // Filtre detaliate Imobiliare - Terenuri
      const isTerenuri = selectedCategory === 'imobiliare' && (selectedSubcategory === 'terenuri-intravilane' || selectedSubcategory === 'terenuri-agricole');
      if (isTerenuri) {
        if (detailedFilters.landSurface?.min) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? '').toString());
          if (isNaN(ls) || ls < parseFloat(detailedFilters.landSurface.min)) return false;
        }
        if (detailedFilters.landSurface?.max) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? '').toString());
          if (isNaN(ls) || ls > parseFloat(detailedFilters.landSurface.max)) return false;
        }
        if (detailedFilters.terrainType?.trim()) {
          const l3 = ((auction as any).categoryLevel3 ?? '').toLowerCase();
          const tt = detailedFilters.terrainType.toLowerCase();
          const match = l3.includes(tt) || l3.includes(tt.replace('ă', 'a')) || l3.includes(tt.replace('â', 'a'));
          if (!match) return false;
        }
      }

      // Filtre detaliate Imobiliare - Spații comerciale, hale industriale
      const isSpatiiComerciale = selectedCategory === 'imobiliare' && (selectedSubcategory === 'spatii-comerciale' || selectedSubcategory === 'hale-industriale');
      if (isSpatiiComerciale) {
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.buildingYear?.min) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? '0', 10);
          if (y && !isNaN(y) && y < parseFloat(detailedFilters.buildingYear.min)) return false;
        }
        if (detailedFilters.buildingYear?.max) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? '0', 10);
          if (y && !isNaN(y) && y > parseFloat(detailedFilters.buildingYear.max)) return false;
        }
      }

      // Filtre detaliate Imobiliare - Proprietăți turistice
      if (selectedCategory === 'imobiliare' && selectedSubcategory === 'proprietati-turistice') {
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? '').toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? '').toString().trim();
          if (auctionRooms && detailedFilters.rooms === '5+') {
            if (parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms && auctionRooms !== detailedFilters.rooms) return false;
        }
      }

      // Price / gratuit — pe API și aici; „doar gratuite” ignoră intervalul de preț.
      if (marketplaceFreeOnly) {
        const cf = (auction as any)?.custom_fields as Record<string, unknown> | undefined;
        const free =
          (auction as any)?.isFreeListing === true ||
          (auction as any)?.is_free_listing === true ||
          cf?.is_free_listing === true ||
          cf?.isFreeListing === true;
        if (!free) return false;
      } else {
        const displayPrice = getAuctionDisplayPriceInSelectedCurrency(auction as any, selectedCurrency);
        if (priceRange.min && displayPrice < parseFloat(priceRange.min)) {
          return false;
        }
        if (priceRange.max && displayPrice > parseFloat(priceRange.max)) {
          return false;
        }
      }

      // Location filter – match textual doar când NU avem centru geo (serverul nu poate sorta după distanță).
      // Cu nearLat/nearLng (rază sau „fără limită”), serverul livrează feed național sortat după distanță;
      // potrivirea strictă pe „Chiajna, Ilfov” în UI ar elimina tot ce e în alt oraș → listă goală.
      const listingsGeoCenterActive =
        nearLat != null &&
        nearLng != null &&
        Number.isFinite(nearLat) &&
        Number.isFinite(nearLng);
      if (!listingsGeoCenterActive && !(auction as { __fromRelaxedGeo?: boolean }).__fromRelaxedGeo) {
        if (selectedLocations.length > 1) {
          if (!selectedLocations.some((loc) => auctionMatchesLocation(auction, loc))) return false;
        } else if (location !== 'all' && !auctionMatchesLocation(auction, location)) {
          return false;
        }
      }

      // Radius / geo inclusion: aplicat în RPC (search_ro_listings_enterprise). Filtrare client
      // după haversine duplica serverul și golea lista când coordonatele din JSON diferă sau lipsesc.

      // Condition filter
      if (!auctionMatchesConditionFilter(auction.condition, selectedSubcategory, condition, selectedConditions)) {
        return false;
      }

      // Timp rămas – doar pentru Executări Silite
      if (String(selectedCategory) === 'executari' && timeRemainingFilter) {
        const endDate = (auction as any).auctionDate ? new Date((auction as any).auctionDate) : null;
        if (!endDate || isNaN(endDate.getTime())) return false;
        const now = new Date();
        const diffMs = endDate.getTime() - now.getTime();
        if (diffMs <= 0) return false;
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = diffHours / 24;
        if (timeRemainingFilter === '24h' && diffHours > 24) return false;
        if (timeRemainingFilter === '48h' && diffHours > 48) return false;
        if (timeRemainingFilter === '1week' && diffDays > 7) return false;
        if (timeRemainingFilter === '2weeks' && diffDays > 14) return false;
      }

      return true;
    };

    const fullFiltered = listToFilter.filter(a => passesFilter(a, false));
    const minimalFiltered = listToFilter.filter(a => passesFilter(a, true));

    const sortFn = (a: any, b: any): number => {
      if (searchQ && searchAnalysis) {
        const primary = searchAnalysis.primaryTerm.toLowerCase();
        const aHasPrimary = (a.title ?? '').toLowerCase().includes(primary);
        const bHasPrimary = (b.title ?? '').toLowerCase().includes(primary);
        if (aHasPrimary !== bHasPrimary) return aHasPrimary ? -1 : 1;
      }
      // Păstrează ordinea inițială (API / ladder) doar pentru „Relevante”; altfel respectă Sortare.
      if (sortBy === 'relevant' && initialOrder.size > 0) {
        const orderA = initialOrder.get(a.id) ?? Infinity;
        const orderB = initialOrder.get(b.id) ?? Infinity;
        return orderA - orderB;
      }
      const dispA = getAuctionDisplayPriceInSelectedCurrency(a as any, selectedCurrency);
      const dispB = getAuctionDisplayPriceInSelectedCurrency(b as any, selectedCurrency);
      const newestTsA = new Date((a as any).createdAt || (a as any).created_at || (a as any).auctionDate || 0).getTime() || 0;
      const newestTsB = new Date((b as any).createdAt || (b as any).created_at || (b as any).auctionDate || 0).getTime() || 0;
      switch (sortBy) {
        case 'relevant':
          return 0;
        case 'newest':
          return newestTsB - newestTsA;
        case 'oldest':
          return newestTsA - newestTsB;
        case 'timeLeft':
          return a.timeLeft.localeCompare(b.timeLeft);
        case 'priceLow':
          return dispA - dispB;
        case 'priceHigh':
          return dispB - dispA;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    };

    // Sortare după relevanță față de TOATE filtrele (când afișăm fallback)
    const relevanceScore = (a: any): number => {
      let s = 0;
      const subKey = normalizeSubcategoryToKey((a.subcategory || '').toString(), filterSchema.subcategoryNames);
      if (selectedSubcategories.length > 1) {
        if (selectedSubcategories.includes(subKey)) s += 120;
      } else if (selectedSubcategory !== 'all' && subKey === selectedSubcategory) s += 120;
      if (selectedCategory === 'imobiliare' && selectedSubcategory === 'all') {
        if (subKey === 'case-vile') s += 50;
        else if (subKey === 'apartamente') s += 40;
        else if (['terenuri-intravilane', 'terenuri-agricole'].includes(subKey)) s += 30;
        else if (['spatii-comerciale', 'hale-industriale'].includes(subKey)) s += 25;
      }
      if (selectedLocations.length > 1) {
        if (selectedLocations.some((loc) => auctionMatchesLocation(a, loc))) s += 80;
      } else if (location !== 'all' && auctionMatchesLocation(a, location)) s += 80;
      const rooms = ((a as any).rooms ?? '').toString().trim();
      if (detailedFilters.rooms && rooms === detailedFilters.rooms) s += 50;
      if (detailedFilters.rooms === '5+' && rooms && parseInt(rooms, 10) >= 5) s += 50;
      const surf = parseFloat(((a as any).surface ?? '').toString());
      if (detailedFilters.surface?.min && !isNaN(surf) && surf >= parseFloat(detailedFilters.surface.min)) s += 20;
      if (detailedFilters.surface?.max && !isNaN(surf) && surf <= parseFloat(detailedFilters.surface.max)) s += 20;
      const dispPrice = getAuctionDisplayPriceInSelectedCurrency(a as any, selectedCurrency);
      if (priceRange.min && dispPrice >= parseFloat(priceRange.min)) s += 25;
      if (priceRange.max && dispPrice <= parseFloat(priceRange.max)) s += 25;
      if (
        (selectedConditions.length > 0 || condition !== 'all') &&
        auctionMatchesConditionFilter(a.condition, selectedSubcategory, condition, selectedConditions)
      ) {
        s += 60;
      }
      if (selectedBrands.length > 1) {
        if (selectedBrands.includes(String((a as any).brand ?? ''))) s += 55;
      } else if (selectedBrand !== 'all' && ((a as any).brand ?? '') === selectedBrand) s += 55;
      if (selectedSizes.length > 1) {
        if (selectedSizes.includes(String((a as any).size ?? ''))) s += 45;
      } else if (selectedSize !== 'all' && ((a as any).size ?? '') === selectedSize) s += 45;
      if (selectedColors.length > 1) {
        if (selectedColors.includes(String((a as any).color ?? ''))) s += 45;
      } else if (selectedColor !== 'all' && ((a as any).color ?? '') === selectedColor) s += 45;
      const year = parseInt((a as any).year ?? '0', 10);
      if (detailedFilters.year?.min && !isNaN(year) && year >= parseFloat(detailedFilters.year.min)) s += 20;
      if (detailedFilters.year?.max && !isNaN(year) && year <= parseFloat(detailedFilters.year.max)) s += 20;
      if (detailedFilters.fuelType?.trim() && ((a as any).fuelType ?? '').toLowerCase() === detailedFilters.fuelType.toLowerCase()) s += 35;
      if (detailedFilters.transmission?.trim() && ((a as any).transmission ?? '').toLowerCase() === detailedFilters.transmission.toLowerCase()) s += 35;
      const landSurf = parseFloat(((a as any).landSurface ?? (a as any).surface ?? '').toString());
      if (detailedFilters.landSurface?.min && !isNaN(landSurf) && landSurf >= parseFloat(detailedFilters.landSurface.min)) s += 20;
      if (detailedFilters.landSurface?.max && !isNaN(landSurf) && landSurf <= parseFloat(detailedFilters.landSurface.max)) s += 20;
      const km = parseInt((a as any).mileage ?? '0', 10);
      if (detailedFilters.mileage?.min && !isNaN(km) && km >= parseFloat(detailedFilters.mileage.min)) s += 20;
      if (detailedFilters.mileage?.max && !isNaN(km) && km <= parseFloat(detailedFilters.mileage.max)) s += 20;
      const cap = parseInt((a as any).capacitateCilindrica ?? (a as any).capacitate_cilindrica ?? '0', 10);
      if (detailedFilters.capacitateCilindrica?.min && !isNaN(cap) && cap >= parseFloat(detailedFilters.capacitateCilindrica.min)) s += 25;
      if (detailedFilters.capacitateCilindrica?.max && !isNaN(cap) && cap <= parseFloat(detailedFilters.capacitateCilindrica.max)) s += 25;
      if (selectedSubcategory === 'piese-auto') {
        if (selectedPieseTipSlugs.length > 0) {
          const aL3 = String((a as any).categoryLevel3 ?? '');
          if (auctionMatchesAnyPieseTipSlug(aL3, selectedPieseTipSlugs)) s += 90;
        }
      } else if (selectedLevel3 !== 'all') {
        const aL3 = String((a as any).categoryLevel3 ?? '');
        if (aL3 === selectedLevel3) s += 90;
      }
      return s;
    };

    const sortedFull = [...fullFiltered].sort(sortFn);
    const sortedMinimal = minimalFiltered.length > 0
      ? [...minimalFiltered].sort((a, b) => {
        const diff = relevanceScore(b) - relevanceScore(a);
        if (diff !== 0) return diff;
        return sortFn(a, b);
      })
      : [];

    const fullIds = new Set(sortedFull.map((a: any) => a.id));
    const supplementary = sortedMinimal.filter((a: any) => !fullIds.has(a.id));

    // Secțiuni progresive cu bare "Te-ar putea interesa" (când avem ladder sections)
    const sections = (ladderBase as any).sections as LadderSection<any>[] | undefined;
    if (Array.isArray(sections) && sections.length > 0) {
      const filteredSectionsRaw = sections.map((s) => ({
        scenario: s.scenario,
        label: s.label,
        items: s.items.filter((a: any) => passesFilter(a, false, s.scenario.categoryKey, s.scenario.subcategoryKey)),
      }));
      const filteredSectionsSorted = filteredSectionsRaw.map((s) => ({
        ...s,
        items: [...s.items].sort(sortFn),
      }));
      const primaryFromSections = filteredSectionsSorted[0]?.items ?? [];
      const supplementaryFromSections = filteredSectionsSorted.slice(1).flatMap((s) => s.items);
      return {
        filteredFull: primaryFromSections,
        filteredMinimal: [...primaryFromSections, ...supplementaryFromSections],
        filteredSupplementary: supplementaryFromSections,
        filteredSections: filteredSectionsSorted,
      };
    }

    return {
      filteredFull: sortedFull,
      filteredMinimal: sortedMinimal,
      filteredSupplementary: supplementary,
      filteredSections: [] as { scenario: any; label: string; items: any[] }[],
    };
  }, [ladderBase, imageSearchProductIds, searchParams, searchQ, searchQTitleOnly, searchAnalysis, selectedCategory, selectedCategories, selectedSubcategory, selectedSubcategories, selectedExecutariMainCategory, selectedExecutariListCategory, selectedExecutariListCategories, activeSelectedExecutariListCategories, selectedLevel3, selectedPieseTipSlugs, selectedSize, selectedSizes, selectedBrand, selectedBrands, selectedColor, selectedColors, selectedCurrency, priceRange, marketplaceFreeOnly, location, selectedLocations, condition, selectedConditions, sortBy, timeRemainingFilter, initialOrder, detailedFilters, nearLat, nearLng, locationCenterFromGps]);

  const minimalNonTest = filteredMinimal.filter((a: any) => !a.isTest);

  // Numai câmpurile care nu sunt în lista principală (brand/model/culoare sunt selectedBrand/selectedModel/selectedColor)
  const hasDetailedFiltersSet = !!(
    detailedFilters.rooms?.trim() || detailedFilters.surface?.min || detailedFilters.surface?.max ||
    detailedFilters.floor?.min || detailedFilters.floor?.max ||
    detailedFilters.buildingYear?.min || detailedFilters.buildingYear?.max ||
    detailedFilters.landSurface?.min || detailedFilters.landSurface?.max ||
    detailedFilters.terrainType?.trim() || detailedFilters.garden || detailedFilters.garage || detailedFilters.pool ||
    (selectedSubcategory !== 'piese-auto' && (
      !!(
        detailedFilters.year?.min || detailedFilters.year?.max ||
        detailedFilters.mileage?.min || detailedFilters.mileage?.max ||
        detailedFilters.fuelType?.trim() || detailedFilters.transmission?.trim() ||
        detailedFilters.capacitateCilindrica?.min || detailedFilters.capacitateCilindrica?.max
      )
    )) ||
    detailedFilters.executionType?.trim() || detailedFilters.court?.trim() || detailedFilters.debtor?.trim() ||
    detailedFilters.executionValue?.min || detailedFilters.executionValue?.max
  );

  /** Badge „filtre active” — aceeași logică ca în sidebar (toolbar + mobil). */
  const marketplaceToolbarFilterCount =
    (selectedCategory !== "all" ? 1 : 0) +
    (String(selectedCategory) === "executari"
      ? (selectedExecutariMainCategory ? 1 : 0) + activeSelectedExecutariListCategories.length
      : hasSelectedSubcategoryFilter
        ? 1
        : 0) +
    (hasAnyLevel3Filter ? 1 : 0) +
    (hasSelectedSizeFilter ? 1 : 0) +
    (hasSelectedBrandFilter ? 1 : 0) +
    (hasSelectedModelFilter ? 1 : 0) +
    (hasSelectedColorFilter ? 1 : 0) +
    (selectedCurrency !== "RON" ? 1 : 0) +
    (marketplaceFreeOnly ? 1 : (priceRange.min || priceRange.max ? 1 : 0)) +
    (hasSelectedLocationFilter ? 1 : 0) +
    (hasSelectedConditionFilter ? 1 : 0) +
    (String(selectedCategory) === "executari" && timeRemainingFilter ? 1 : 0) +
    (hasDetailedFiltersSet ? 1 : 0) +
    (hasSelectedSellerKindFilter ? 1 : 0);

  /** Comutator „Executări în categorie” în sheet/sidebar filtre (nu când e selectat doar Executări). */
  const showExecutariCrosslistInFilters = listingsScope !== "executari" && selectedCategory !== "executari";

  /** Filtru doar pe câmpuri detaliate (nu încă în API): rooms, surface, year, mileage, etc. */
  const passesDetailedFiltersOnly = useCallback(
    (auction: any): boolean => {
      const subKey = (auction.subcategory || "").toLowerCase().replace(/\s+/g, "-");
      const isAutoOrVehicle = selectedSubcategory === "exec-autovehicule" || ["autoturisme", "suv-4x4", "motociclete", "camioane", "remorci", "autorulote", "vehicule-electrice", "piese-auto"].some((s) => subKey.includes(s));
      const isPhoneOrTablet = ["telefoane", "tablete", "telefoane-mobile"].some((s) => subKey.includes(s));
      if ((isAutoOrVehicle || isPhoneOrTablet) && selectedSubcategory !== "piese-auto") {
        if (detailedFilters.year?.min) {
          const y = parseInt((auction as any).year || "0", 10);
          if (isNaN(y) || y < parseFloat(detailedFilters.year.min)) return false;
        }
        if (detailedFilters.year?.max) {
          const y = parseInt((auction as any).year || "0", 10);
          if (isNaN(y) || y > parseFloat(detailedFilters.year.max)) return false;
        }
        if (detailedFilters.mileage?.min || detailedFilters.mileage?.max) {
          const km = parseInt((auction as any).mileage || "0", 10);
          if (detailedFilters.mileage?.min && (isNaN(km) || km < parseFloat(detailedFilters.mileage.min))) return false;
          if (detailedFilters.mileage?.max && (isNaN(km) || km > parseFloat(detailedFilters.mileage.max))) return false;
        }
        if (detailedFilters.capacitateCilindrica?.min) {
          const cap = parseInt((auction as any).capacitateCilindrica || (auction as any).capacitate_cilindrica || "0", 10);
          if (isNaN(cap) || cap < parseFloat(detailedFilters.capacitateCilindrica.min)) return false;
        }
        if (detailedFilters.capacitateCilindrica?.max) {
          const cap = parseInt((auction as any).capacitateCilindrica || (auction as any).capacitate_cilindrica || "0", 10);
          if (isNaN(cap) || cap > parseFloat(detailedFilters.capacitateCilindrica.max)) return false;
        }
        if (detailedFilters.fuelType?.trim()) {
          const auctionFuel = (auction as any).fuelType || "";
          if (auctionFuel.toLowerCase().trim() !== detailedFilters.fuelType.trim().toLowerCase()) return false;
        }
        if (detailedFilters.transmission?.trim()) {
          const auctionTrans = (auction as any).transmission || "";
          if (auctionTrans.toLowerCase().trim() !== detailedFilters.transmission.trim().toLowerCase()) return false;
        }
      }
      const isApartamente = selectedCategory === "imobiliare" && (selectedSubcategory === "apartamente" || selectedSubcategory === "exec-imobiliare" || selectedSubcategory === "all");
      if (isApartamente) {
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? "").toString().trim();
          if (detailedFilters.rooms === "5+") {
            if (auctionRooms && parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms !== detailedFilters.rooms) return false;
        }
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (isNaN(s) || s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (isNaN(s) || s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.floor?.min) {
          const f = parseFloat(((auction as any).floor ?? "").toString().replace(/\D/g, "") || "0");
          if (isNaN(f) || f < parseFloat(detailedFilters.floor.min)) return false;
        }
        if (detailedFilters.floor?.max) {
          const f = parseFloat(((auction as any).floor ?? "").toString().replace(/\D/g, "") || "0");
          if (isNaN(f) || f > parseFloat(detailedFilters.floor.max)) return false;
        }
        if (detailedFilters.buildingYear?.min) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? "0", 10);
          if (isNaN(y) || y < parseFloat(detailedFilters.buildingYear.min)) return false;
        }
        if (detailedFilters.buildingYear?.max) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? "0", 10);
          if (isNaN(y) || y > parseFloat(detailedFilters.buildingYear.max)) return false;
        }
      }
      const isCaseVile = selectedCategory === "imobiliare" && (selectedSubcategory === "case-vile" || selectedSubcategory === "exec-imobiliare" || selectedSubcategory === "all");
      if (isCaseVile) {
        if (detailedFilters.landSurface?.min) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? "").toString());
          if (isNaN(ls) || ls < parseFloat(detailedFilters.landSurface.min)) return false;
        }
        if (detailedFilters.landSurface?.max) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? "").toString());
          if (isNaN(ls) || ls > parseFloat(detailedFilters.landSurface.max)) return false;
        }
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? "").toString().trim();
          if (auctionRooms && detailedFilters.rooms === "5+") {
            if (parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms && auctionRooms !== detailedFilters.rooms) return false;
        }
        if (detailedFilters.garden) {
          const hasGarden = (auction as any).gradina === true;
          const desc = ((auction as any).description ?? "").toLowerCase();
          if (!hasGarden && !desc.includes("grădină") && !desc.includes("gradina") && !desc.includes("curte")) return false;
        }
        if (detailedFilters.garage) {
          const hasGarage = (auction as any).garaj === true;
          const desc = ((auction as any).description ?? "").toLowerCase();
          if (!hasGarage && !desc.includes("garaj") && !desc.includes("garage")) return false;
        }
        if (detailedFilters.pool) {
          const hasPool = (auction as any).piscina === true;
          const desc = ((auction as any).description ?? "").toLowerCase();
          if (!hasPool && !desc.includes("piscină") && !desc.includes("piscina") && !desc.includes("pool")) return false;
        }
      }
      const isTerenuri = selectedCategory === "imobiliare" && (selectedSubcategory === "terenuri-intravilane" || selectedSubcategory === "terenuri-agricole");
      if (isTerenuri) {
        if (detailedFilters.landSurface?.min) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? "").toString());
          if (isNaN(ls) || ls < parseFloat(detailedFilters.landSurface.min)) return false;
        }
        if (detailedFilters.landSurface?.max) {
          const ls = parseFloat(((auction as any).landSurface ?? (auction as any).surface ?? "").toString());
          if (isNaN(ls) || ls > parseFloat(detailedFilters.landSurface.max)) return false;
        }
        if (detailedFilters.terrainType?.trim()) {
          const l3 = ((auction as any).categoryLevel3 ?? "").toLowerCase();
          const tt = detailedFilters.terrainType.toLowerCase();
          const match = l3.includes(tt) || l3.includes(tt.replace("ă", "a")) || l3.includes(tt.replace("â", "a"));
          if (!match) return false;
        }
      }
      const isSpatiiComerciale = selectedCategory === "imobiliare" && (selectedSubcategory === "spatii-comerciale" || selectedSubcategory === "hale-industriale");
      if (isSpatiiComerciale) {
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.buildingYear?.min) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? "0", 10);
          if (y && !isNaN(y) && y < parseFloat(detailedFilters.buildingYear.min)) return false;
        }
        if (detailedFilters.buildingYear?.max) {
          const y = parseInt((auction as any).buildingYear ?? (auction as any).year ?? "0", 10);
          if (y && !isNaN(y) && y > parseFloat(detailedFilters.buildingYear.max)) return false;
        }
      }
      if (selectedCategory === "imobiliare" && selectedSubcategory === "proprietati-turistice") {
        if (detailedFilters.surface?.min) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s < parseFloat(detailedFilters.surface.min)) return false;
        }
        if (detailedFilters.surface?.max) {
          const s = parseFloat(((auction as any).surface ?? "").toString());
          if (s && !isNaN(s) && s > parseFloat(detailedFilters.surface.max)) return false;
        }
        if (detailedFilters.rooms?.trim()) {
          const auctionRooms = ((auction as any).rooms ?? "").toString().trim();
          if (auctionRooms && detailedFilters.rooms === "5+") {
            if (parseInt(auctionRooms, 10) < 5) return false;
          } else if (auctionRooms && auctionRooms !== detailedFilters.rooms) return false;
        }
      }
      if (detailedFilters.executionType?.trim() && ((auction as any).executionType ?? "").toString().trim().toLowerCase() !== detailedFilters.executionType.trim().toLowerCase()) return false;
      if (detailedFilters.court?.trim() && ((auction as any).court ?? "").toString().trim().toLowerCase() !== detailedFilters.court.trim().toLowerCase()) return false;
      if (detailedFilters.debtor?.trim() && !((auction as any).debtor ?? "").toString().toLowerCase().includes(detailedFilters.debtor.trim().toLowerCase())) return false;
      if (detailedFilters.executionValue?.min) {
        const v = parseFloat(((auction as any).executionValue ?? (auction as any).startingPrice ?? "").toString());
        if (!isNaN(v) && v < parseFloat(detailedFilters.executionValue.min)) return false;
      }
      if (detailedFilters.executionValue?.max) {
        const v = parseFloat(((auction as any).executionValue ?? (auction as any).startingPrice ?? "").toString());
        if (!isNaN(v) && v > parseFloat(detailedFilters.executionValue.max)) return false;
      }
      return true;
    },
    [selectedCategory, selectedSubcategory, detailedFilters]
  );

  // IMPORTANT:
  // Lista randată trebuie să treacă mereu prin aceeași filtrare completă (passesFilter),
  // altfel pot apărea carduri din alte categorii când realProducts este populat.
  const effectiveFeedForDisplay = filteredFull;

  const fullNonTest = effectiveFeedForDisplay.filter((a: any) => !a.isTest);
  const useFiltersFallback = fullNonTest.length === 0 && minimalNonTest.length > 0;
  const primaryAuctions = useMemo(
    () => distributePremiumAuctions(effectiveFeedForDisplay, listingsPageSize, 6),
    [effectiveFeedForDisplay, listingsPageSize],
  );
  const primaryNonTest = primaryAuctions.filter((a: any) => !a.isTest);
  const supplementaryNonTest = useMemo(() => {
    if (realProducts.length > 0) {
      const primaryIds = new Set(primaryAuctions.map((a: any) => a.id));
      return effectiveFeedForDisplay.filter((a: any) => !a.isTest && !primaryIds.has(a.id));
    }
    return filteredSupplementary.filter((a: any) => !a.isTest);
  }, [realProducts.length, effectiveFeedForDisplay, primaryAuctions, filteredSupplementary]);

  const combinedAuctions = useMemo(
    () => (realProducts.length > 0 ? [...primaryAuctions, ...supplementaryNonTest] : [...primaryAuctions, ...filteredSupplementary]),
    [realProducts.length, primaryAuctions, supplementaryNonTest, filteredSupplementary]
  );
  const filteredAuctions = useMemo(() => {
    if (nearLat == null || nearLng == null || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) {
      return combinedAuctions;
    }

    /** Ordine după distanță pe client; nu mai filtra după rază — RPC-ul aplică geo + fallback. */
    const mapped = combinedAuctions.map((auction, index) => ({
      auction,
      index,
      distanceKm: getAuctionDistanceKm(
        {
          coordinates:
            (auction as { coordinates?: unknown }).coordinates ??
            resolvedListingCoordinates[String((auction as { id?: unknown; slug?: unknown }).id ?? (auction as { slug?: unknown }).slug ?? '')],
          custom_fields: (auction as { custom_fields?: Record<string, unknown> | null }).custom_fields,
        },
        { lat: nearLat, lng: nearLng },
      ),
    }));

    return mapped
      .sort((a, b) => {
        const aHasDistance = a.distanceKm != null;
        const bHasDistance = b.distanceKm != null;
        if (aHasDistance && bHasDistance) {
          const diff = (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
          return diff !== 0 ? diff : a.index - b.index;
        }
        if (aHasDistance !== bHasDistance) return aHasDistance ? -1 : 1;
        return a.index - b.index;
      })
      .map(({ auction }) => auction);
  }, [combinedAuctions, nearLat, nearLng, resolvedListingCoordinates]);

  /** Rezultate afișate cu centru geo dar fără distanță calculabilă (ex. fallback național fără coords în UI). */
  const showGeoGeneralFallbackMessage = useMemo(() => {
    if (nearLat == null || nearLng == null || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) {
      return false;
    }
    const rows = filteredAuctions.filter((a: any) => !a.isTest);
    if (rows.length === 0) return false;
    for (const auction of rows) {
      const d = getAuctionDistanceKm(
        {
          coordinates:
            (auction as { coordinates?: unknown }).coordinates ??
            resolvedListingCoordinates[
              String((auction as { id?: unknown; slug?: unknown }).id ?? (auction as { slug?: unknown }).slug ?? '')
            ],
          custom_fields: (auction as { custom_fields?: Record<string, unknown> | null }).custom_fields,
        },
        { lat: nearLat, lng: nearLng },
      );
      if (d != null) return false;
    }
    return true;
  }, [filteredAuctions, nearLat, nearLng, resolvedListingCoordinates]);

  // La schimbarea filtrelor/căutării resetează la primele 30
  const filtersSignature = `${listingsScope}|${includeExecutariCrosslist ? 'exec-on' : 'exec-off'}|${selectedCategory}|${selectedCategories.join(',')}|${selectedSubcategory}|${selectedSubcategories.join(',')}|${selectedExecutariMainCategory}|${activeSelectedExecutariListCategories.join(',')}|${selectedLevel3}|${selectedPieseTipSlugs.join(',')}|${selectedSize}|${selectedSizes.join(',')}|${selectedBrand}|${selectedBrands.join(',')}|${selectedModel}|${selectedModels.join(',')}|${selectedColor}|${selectedColors.join(',')}|${JSON.stringify(priceRange)}|${location}|${selectedLocations.join(',')}|${condition}|${selectedConditions.join(',')}|${imageFilter}|${selectedSellerKinds.join(',')}|${sortBy}|${searchParams?.get?.('q') ?? ''}|r${locationRadiusKm}|${nearLat ?? ''}|${nearLng ?? ''}|free:${marketplaceFreeOnly ? '1' : '0'}`;
  // Sugestii modele apropiate când 0 rezultate + căutare tip model (ex: iPhone 14)
  const nonTestCount = filteredAuctions.filter((a) => !(a as any).isTest).length;
  useEffect(() => {
    if (nonTestCount > 0) {
      setSimilarModelsSuggestions([]);
      return;
    }
    const q = (searchParams?.get?.('q') ?? '').trim();
    if (!q || !searchAnalysis?.brand || !searchAnalysis?.modelQuery || imageSearchProductIds !== null) {
      setSimilarModelsSuggestions([]);
      return;
    }
    const cat = selectedCategory !== 'all' ? selectedCategory : searchAnalysis.categoryKey;
    const sub = effectiveSelectedSubcategory !== 'all' ? effectiveSelectedSubcategory : searchAnalysis.subcategoryKey;
    if (cat === 'all') {
      setSimilarModelsSuggestions([]);
      return;
    }
    setSimilarModelsLoading(true);
    const categoryPath = sub !== 'all' ? `${cat}/${sub}` : cat;
    fetch(
      `/api/search/similar-models?category_path=${encodeURIComponent(categoryPath)}&brand_key=${encodeURIComponent(searchAnalysis.brand)}&model_query=${encodeURIComponent(searchAnalysis.modelQuery)}&limit=8`
    )
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.suggestions)) {
          setSimilarModelsSuggestions(data.suggestions);
        } else {
          setSimilarModelsSuggestions([]);
        }
      })
      .catch(() => setSimilarModelsSuggestions([]))
      .finally(() => setSimilarModelsLoading(false));
  }, [nonTestCount, searchParams?.get?.('q'), searchAnalysis?.brand, searchAnalysis?.modelQuery, searchAnalysis?.categoryKey, searchAnalysis?.subcategoryKey, selectedCategory, selectedSubcategory, effectiveSelectedSubcategory, selectedSubcategories, imageSearchProductIds]);

  // Zero-Results Recovery: alternative queries + relaxări filtre (doar când 0 rezultate)
  useEffect(() => {
    if (realProducts.length > 0) {
      setRecoveryData(null);
      return;
    }
    const q = (searchParams?.get?.("q") ?? "").trim();
    if (!q) return;
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("q", q || "");
    params.set("resultCount", "0");
    if (searchParams?.get?.("category")) params.set("category", searchParams.get("category")!);
    if (searchParams?.get?.("subcategory")) params.set("subcategory", searchParams.get("subcategory")!);
    if (searchParams?.get?.("county")) params.set("county", searchParams.get("county")!);
    if (searchParams?.get?.("city")) params.set("city", searchParams.get("city")!);
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (cancelled) return;
      const session = data.session;
      const headers: HeadersInit = { "Cache-Control": "no-store" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      fetch(`/api/ro/search/recovery?${params.toString()}`, { headers })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data?.ok || !data?.enabled) {
            setRecoveryData(null);
            return;
          }
          setRecoveryData({
            alternatives: data.alternatives ?? [],
            relaxations: data.relaxations ?? [],
          });
        })
        .catch(() => setRecoveryData(null));
    });
    return () => {
      cancelled = true;
    };
  }, [realProducts.length, filtersSignatureFromUrl, searchParams]);

  // Listă completă pentru paginare (fără bare) – aceeași ordine: din secțiuni sau primary + supplementary
  const fullListForPagination = useMemo(() => {
    const sectionsForDisplay = filteredSections?.length ? filteredSections : null;
    if (sectionsForDisplay && sectionsForDisplay.length > 0) {
      const all: any[] = [];
      for (const sec of sectionsForDisplay) {
        const nonTest = (sec.items || []).filter((a: any) => !a.isTest);
        all.push(...nonTest);
      }
      return all;
    }
    if (nearLat != null && nearLng != null && Number.isFinite(nearLat) && Number.isFinite(nearLng)) {
      return filteredAuctions.filter((a: any) => !a.isTest);
    }
    return [...primaryNonTest, ...supplementaryNonTest];
  }, [filteredSections, primaryNonTest, supplementaryNonTest, filteredAuctions, nearLat, nearLng]);

  const selectedCategoryBaseCount =
    selectedCategory !== 'all' ? (categoryCountsFromDb[selectedCategory] ?? null) : null;
  const selectedSubcategoryBaseCount = useMemo(() => {
    if (selectedCategory === 'all') return null;
    if (activeSelectedSubcategories.length === 0) return null;
    if (activeSelectedSubcategories.length === 1) {
      const only = activeSelectedSubcategories[0];
      const value = subcategoryCountsFromDb[only];
      return typeof value === 'number' ? value : null;
    }
    let sum = 0;
    let found = false;
    for (const sub of activeSelectedSubcategories) {
      const value = subcategoryCountsFromDb[sub];
      if (typeof value === 'number') {
        sum += value;
        found = true;
      }
    }
    return found ? sum : null;
  }, [selectedCategory, activeSelectedSubcategories, subcategoryCountsFromDb]);
  const hasNonCategoryFiltersForHeader = useMemo(() => {
    const q = (searchParams?.get?.('q') ?? '').trim();
    const hasExecSpecificFilters =
      selectedCategory === 'executari' &&
      (!!selectedExecutariMainCategory || activeSelectedExecutariListCategories.length > 0);
    return !!(
      q ||
      hasAnyLevel3Filter ||
      selectedSizes.length > 0 ||
      selectedSize !== 'all' ||
      selectedBrands.length > 0 ||
      selectedBrand !== 'all' ||
      selectedModels.length > 0 ||
      selectedModel !== 'all' ||
      hasSelectedColorFilter ||
      priceRange.min ||
      priceRange.max ||
      selectedLocations.length > 0 ||
      location !== 'all' ||
      selectedConditions.length > 0 ||
      condition !== 'all' ||
      (selectedCategory === 'executari' && !!timeRemainingFilter) ||
      hasDetailedFiltersSet ||
      hasExecSpecificFilters ||
      hasSelectedSellerKindFilter
    );
  }, [
    searchParams,
    selectedCategory,
    selectedExecutariMainCategory,
    activeSelectedExecutariListCategories,
    selectedLevel3,
    selectedPieseTipSlugs,
    effectiveSelectedSubcategory,
    selectedSizes,
    selectedSize,
    selectedBrands,
    selectedBrand,
    selectedModels,
    selectedModel,
    selectedColors,
    selectedColor,
    hasSelectedColorFilter,
    priceRange.min,
    priceRange.max,
    selectedLocations,
    location,
    selectedConditions,
    condition,
    timeRemainingFilter,
    hasDetailedFiltersSet,
    hasSelectedSellerKindFilter,
  ]);

  // Când fallback-ul de căutare restrânge prea mult (ex. 4) dar categoria are mult mai multe (ex. 315),
  // afișăm lista completă din categoria curentă, ca UX-ul să rămână consistent cu totalul categoriei.
  const shouldUseCategoryWideResults = useMemo(() => {
    if (selectedCategory === 'all') return false;
    if (selectedCategoryBaseCount === null) return false;
    if (selectedCategoryBaseCount <= fullListForPagination.length) return false;
    const hasLadderExpansion =
      !!(
        ladderBase?.reasonFlags?.locationExpanded ||
        ladderBase?.reasonFlags?.categoryExpanded ||
        ladderBase?.reasonFlags?.termsReduced
      );
    return hasLadderExpansion;
  }, [selectedCategory, selectedCategoryBaseCount, fullListForPagination.length, ladderBase]);

  const categoryWideListForPagination = useMemo(() => {
    if (!shouldUseCategoryWideResults || selectedCategory === 'all') return [] as any[];

    const normalize = (v: string) => normalizeForSearch(v || '');
    const currentCategoryNorm = normalize(selectedCategory);

    const mapped = auctions.filter((auction: any) => {
      const auctionCatNorm = normalize(String(auction?.category || ''));
      const isFromInsolventa =
        (auction as any).productType === 'licitatii-publice' ||
        (auction as any).saleType === 'licitatii-insolventa' ||
        (auction as any).saleType === 'licitatie-publica';

      if (auctionCatNorm === currentCategoryNorm) return true;
      if (selectedCategory === 'executari' && isFromInsolventa) return true;

      if (includeExecutariCrosslist && isFromInsolventa && selectedCategory !== 'executari') {
        const subKey = normalizeSubcategoryToKey((auction.subcategory || '').toString(), filterSchema.subcategoryNames);
        const mainText = normalizeForSearch(((auction as any).main_category || '').toString());
        const listText = normalizeForSearch(((auction as any).list_category || '').toString());
        const full = `${subKey} ${mainText} ${listText}`;
        let derived = 'diverse';
        if (subKey === 'exec-imobiliare' || /\b(imobil|apartament|casa|teren|spatiu)\b/.test(full)) derived = 'imobiliare';
        else if (subKey === 'exec-autovehicule' || /\b(auto|autoturism|vehicul|camion|motocic)\b/.test(full)) derived = 'autovehicule';
        else if (subKey === 'exec-industrial' || /\b(utilaj|industrial|echipament|tractor|excavator)\b/.test(full)) derived = 'utilaje';
        else if (subKey === 'exec-afaceri' || subKey === 'exec-office' || /\b(afaceri|office|stoc|firma|lichidare)\b/.test(full)) derived = 'business';

        if (derived === currentCategoryNorm) return true;
      }

      return false;
    }).filter((a: any) => !a.isTest);

    return [...mapped].sort((a: any, b: any) => {
      if (sortBy === 'relevant' && initialOrder.size > 0) {
        const orderA = initialOrder.get(a.id) ?? Infinity;
        const orderB = initialOrder.get(b.id) ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
      }
      const displayA = getAuctionDisplayPriceInSelectedCurrency(a as any, selectedCurrency);
      const displayB = getAuctionDisplayPriceInSelectedCurrency(b as any, selectedCurrency);
      const newestTsA = new Date((a as any).createdAt || (a as any).created_at || (a as any).auctionDate || 0).getTime() || 0;
      const newestTsB = new Date((b as any).createdAt || (b as any).created_at || (b as any).auctionDate || 0).getTime() || 0;
      switch (sortBy) {
        case 'relevant':
          return 0;
        case 'newest':
          return newestTsB - newestTsA;
        case 'oldest':
          return newestTsA - newestTsB;
        case 'timeLeft':
          return a.timeLeft.localeCompare(b.timeLeft);
        case 'priceLow':
          return displayA - displayB;
        case 'priceHigh':
          return displayB - displayA;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
  }, [shouldUseCategoryWideResults, selectedCategory, includeExecutariCrosslist, auctions, initialOrder, selectedCurrency, sortBy]);

  const listForPagination = shouldUseCategoryWideResults ? categoryWideListForPagination : fullListForPagination;

  /** Submulțime după filtrare fină (marcă auto blocată + cuvinte în titlu/descriere/locație/preț + „maxim N”). */
  const listForPaginationAfterFineSearch = useMemo(() => {
    const hasFineBrand = !!(fineSearchLockedAutoSlug && fineSearchLockedAutoBrand);
    const { maxAmount, priceCurrency, textRest } = parseFineSearchMaxClause(marketplaceSearchText);
    const textNorm = normalizeForSearch(textRest);
    const tokens = textNorm.split(/\s+/).filter((t) => t.length >= 2);

    const fineUrlQ = [fineSearchLockedAutoBrand?.trim(), textRest.trim()].filter(Boolean).join(" ").trim();
    const serverAlreadyFilteredByFineQ =
      fineUrlQ.length > 0 && normalizeForSearch(fineUrlQ) === normalizeForSearch(searchQ);

    if (serverAlreadyFilteredByFineQ) {
      if (maxAmount == null) return listForPagination;
      return listForPagination.filter((a: any) =>
        auctionWithinFineSearchMax(a, maxAmount, priceCurrency, selectedCurrency),
      );
    }

    // Între două tastări: `q` din URL e încă vechi (debounce router), dar filtrarea client pe tokeni
    // golește lista → skeleton și senzația de „foarte lent”. Afișăm răspunsul server până se aliniază `q`.
    if (
      selectedCategory !== "all" &&
      fineUrlQ.length > 0 &&
      normalizeForSearch(fineUrlQ) !== normalizeForSearch(searchQ)
    ) {
      if (maxAmount == null) return listForPagination;
      return listForPagination.filter((a: any) =>
        auctionWithinFineSearchMax(a, maxAmount, priceCurrency, selectedCurrency),
      );
    }

    if (!hasFineBrand && tokens.length === 0 && maxAmount == null) {
      return listForPagination;
    }

    return listForPagination.filter((a: any) => {
      if (hasFineBrand) {
        if (
          !auctionMatchesFineSearchAutoBrand(
            a,
            fineSearchLockedAutoSlug!,
            fineSearchLockedAutoBrand!,
          )
        ) {
          return false;
        }
      }
      if (maxAmount != null) {
        if (!auctionWithinFineSearchMax(a, maxAmount, priceCurrency, selectedCurrency)) {
          return false;
        }
      }
      if (tokens.length === 0) return true;
      const title = normalizeForSearch(String(a?.title ?? ''));
      const desc = normalizeForSearch(
        String((a as any)?.description ?? (a as any)?.shortDescription ?? ''),
      );
      const titleDesc = `${title} ${desc}`;
      const loc = fineSearchLocationHaystack(a);
      const price = fineSearchPriceHaystack(a);
      return tokens.every(
        (t) => titleDesc.includes(t) || loc.includes(t) || price.includes(t),
      );
    });
  }, [
    listForPagination,
    marketplaceSearchText,
    fineSearchLockedAutoSlug,
    fineSearchLockedAutoBrand,
    selectedCategory,
    selectedCurrency,
    searchQ,
  ]);

  /** Etichetă pentru „X din Y … în „…"": categorie · subcategorie(i) · tip(uri) piesă (piese-auto). */
  const resultsSummaryScopeLabel = useMemo(() => {
    if (selectedCategory === 'all') return '';
    const catName = categories[selectedCategory as keyof typeof categories]?.name ?? selectedCategory;
    const subKeys =
      activeSelectedSubcategories.length > 0
        ? activeSelectedSubcategories
        : effectiveSelectedSubcategory !== 'all'
          ? [effectiveSelectedSubcategory]
          : [];
    const subLabels = subKeys.map((k) => subcategoryNames[k as keyof typeof subcategoryNames] ?? k);
    const parts: string[] = [catName];
    if (subLabels.length > 0) {
      parts.push(subLabels.join(', '));
    }
    if (effectiveSelectedSubcategory === 'piese-auto') {
      const tipLabels: string[] = [];
      if (selectedPieseTipSlugs.length > 0) {
        for (const slug of selectedPieseTipSlugs) {
          tipLabels.push(filterSchema.level3LabelsBySubcategory?.['piese-auto']?.[slug] ?? slug);
        }
      } else if (selectedLevel3 !== 'all') {
        tipLabels.push(
          filterSchema.level3LabelsBySubcategory?.['piese-auto']?.[selectedLevel3] ?? selectedLevel3
        );
      }
      if (tipLabels.length > 0) {
        parts.push(tipLabels.join(', '));
      }
    }
    return parts.join(' · ');
  }, [
    selectedCategory,
    categories,
    activeSelectedSubcategories,
    effectiveSelectedSubcategory,
    subcategoryNames,
    filterSchema,
    selectedPieseTipSlugs,
    selectedLevel3,
  ]);

  /** Pentru rezumat compact: marcă și/sau q din URL (fără „marcă” / „Criterii”). */
  const resultsSummaryCompactQueryParts = useMemo(() => {
    const q = searchQ.trim();
    const brandRaw =
      urlBrandParam && urlBrandParam.toLowerCase() !== "all" ? urlBrandParam.trim() : "";
    if (brandRaw && q && normalizeForSearch(q) === normalizeForSearch(brandRaw)) {
      return { brand: brandRaw, q: null as string | null };
    }
    let qDisplay: string | null = q || null;
    if (brandRaw && qDisplay) {
      let next = qDisplay;
      for (let i = 0; i < 10; i++) {
        const s = stripRedundantBrandPrefixFromSummaryQuery(brandRaw, next);
        if (s === next) break;
        next = s;
      }
      qDisplay = next.trim() || null;
    }
    return { brand: brandRaw || null, q: qDisplay };
  }, [searchQ, urlBrandParam]);

  const resultsSummaryHasCompactQuery =
    !!resultsSummaryCompactQueryParts.brand || !!resultsSummaryCompactQueryParts.q;

  /** Categorie / subcategorie într-un singur segment scurt (fără „Autovehicule · …” complet). */
  const resultsSummaryCompactScopeLabel = useMemo(() => {
    if (selectedCategory === "all") return "";
    if (effectiveSelectedSubcategory !== "all") {
      return String(subcategoryNames[effectiveSelectedSubcategory as keyof typeof subcategoryNames] ?? effectiveSelectedSubcategory);
    }
    return categories[selectedCategory as keyof typeof categories]?.name ?? selectedCategory;
  }, [selectedCategory, effectiveSelectedSubcategory, subcategoryNames, categories]);

  /**
   * Total pentru rezumat + paginare: întâi count-ul din API client; dacă încă lipsește, snapshot SSR (`initialListings`).
   * Fără fallback-ul SSR, `computedPaginationTotalPages` folosea doar „pagina curentă + 1” și roata afișa doar 1–2, apoi 3… la fiecare click.
   */
  const totalCountForPagination = useMemo(() => {
    if (typeof totalCountFromDb === "number") return totalCountFromDb;
    if (typeof initialListings?.totalCount === "number") return initialListings.totalCount;
    return null;
  }, [totalCountFromDb, initialListings?.totalCount]);

  /** Total real din API/DB pentru filtrele curente. Nu îl înlocuim cu numărul de rânduri încărcate. */
  const resultsSummaryDenominator = useMemo(() => {
    if (typeof totalCountForPagination !== "number") return null;
    return totalCountForPagination;
  }, [totalCountForPagination]);

  const resultsSummaryTotalLabel = useMemo(() => {
    if (typeof totalCountFromDb !== "number" || resultsSummaryDenominator == null) return null;
    if (totalKindFromDb === "capped" && totalCountFromDb >= 1001) return "peste 1.000";
    if (totalKindFromDb === "estimate") return `~${resultsSummaryDenominator.toLocaleString("ro-RO")}`;
    return resultsSummaryDenominator.toLocaleString("ro-RO");
  }, [totalCountFromDb, totalKindFromDb, resultsSummaryDenominator]);

  const paginatedItems = useMemo(() => listForPaginationAfterFineSearch, [listForPaginationAfterFineSearch]);
  const displayedCount = listForPaginationAfterFineSearch.length;
  const totalPagesListed =
    typeof totalCountForPagination === "number"
      ? Math.max(1, Math.ceil(totalCountForPagination / listingsPageSize))
      : null;
  /** Total pagini după count confirmat de API (nu SSR) — folosit la roată ca să nu „pulseze” numărul. */
  const authoritativeTotalPages = useMemo(() => {
    if (!listingsCountAuthoritative || typeof totalCountFromDb !== "number") return null;
    return Math.max(1, Math.ceil(totalCountFromDb / listingsPageSize));
  }, [listingsCountAuthoritative, totalCountFromDb, listingsPageSize]);
  /** Total derivat din count / hasMore — fără SSR până vine count-ul autoritar. */
  const computedPaginationTotalPages = useMemo(() => {
    const totalPagesFromCount =
      typeof authoritativeTotalPages === "number" ? authoritativeTotalPages : 0;
    const totalPagesFromRemote = listingsUrlPage + (hasMoreRemote ? 1 : 0);
    return Math.max(totalPagesFromCount, totalPagesFromRemote, listingsUrlPage, 1);
  }, [authoritativeTotalPages, listingsUrlPage, hasMoreRemote]);

  /** Pe aceeași semnătură de filtre, totalul UI nu scade (evită dispariția bruscă a sloturilor la navigare). */
  type PaginationStableState = { sig: string; floor: number };
  const [paginationStable, setPaginationStable] = useState<PaginationStableState | null>(null);

  useEffect(() => {
    setPaginationStable((prev) => {
      if (!prev || prev.sig !== roPaginationFiltersSignature) {
        return { sig: roPaginationFiltersSignature, floor: computedPaginationTotalPages };
      }
      return {
        sig: roPaginationFiltersSignature,
        floor: Math.max(prev.floor, computedPaginationTotalPages),
      };
    });
  }, [roPaginationFiltersSignature, computedPaginationTotalPages]);

  const paginationStableFloor =
    paginationStable?.sig === roPaginationFiltersSignature ? paginationStable.floor : 0;
  const displayPaginationTotalPages =
    typeof authoritativeTotalPages === "number"
      ? authoritativeTotalPages
      : Math.max(computedPaginationTotalPages, paginationStableFloor);

  /** Afișăm paginarea după feed-ul real; count-ul strict poate fi mai mic când lista a fost relaxată/extinsă. */
  const showRoPagination = useMemo(() => {
    if (computedPaginationTotalPages > 1) return true;
    if (listingsUrlPage > 1) return true;
    if (hasMoreRemote) return true;
    if (realProducts.length >= listingsPageSize) return true;
    return false;
  }, [computedPaginationTotalPages, listingsUrlPage, hasMoreRemote, realProducts.length]);

  const hasMore =
    hasMoreRemote ||
    (typeof totalPagesListed === "number" && listingsUrlPage < totalPagesListed);
  const canShowStrictTotalSummary =
    typeof totalCountFromDb === "number" &&
    resultsSummaryDenominator != null;
  const displayedAuctions = paginatedItems;
  // Count afișat = exact lista randată în grid (nu totalCountFromDb, care poate fi 0 sau din alt query).
  // Stopgap: do not show total from client Supabase (can drift from /api/ro/listings). Use list length / hasMore only.
  const effectiveResultsCount =
    shouldUseCategoryWideResults
      ? (selectedCategoryBaseCount ?? listForPaginationAfterFineSearch.length)
      : (
        !hasNonCategoryFiltersForHeader
          ? (selectedSubcategoryBaseCount ?? selectedCategoryBaseCount ?? listForPaginationAfterFineSearch.length)
          : listForPaginationAfterFineSearch.length
      );

  // Prag și limite pentru completare „gap fill” (aceleași praguri ca înainte; acum inclusiv la 0 rezultate principale)
  const TE_AR_PUTEA_INTERESA_THRESHOLD = 12;
  const TE_AR_PUTEA_INTERESA_LIMIT_PER_REQUEST = listingsPageSize;
  const TE_AR_PUTEA_INTERESA_MAX_ITEMS = 36;

  // Request relaxat (fără radiusKm): backup când feed strict e gol; supliment când lista principală e sub prag.
  useEffect(() => {
    if (!SHOW_RELAXED_SUGGESTIONS_SECTION) {
      setRelaxedGapFillAuctions([]);
      setRelaxedBackupProducts([]);
      setRelaxedGapFillLoading(false);
      return;
    }

    const hasSignal =
      (searchParams?.get?.("q") ?? "").trim() !== "" ||
      (selectedBrand !== "all" && !!selectedBrand) ||
      (selectedCategory !== "all" && !!selectedCategory) ||
      locationSearch.trim() !== "" ||
      (location !== "all" && !!location) ||
      selectedLocations.length > 0 ||
      (nearLat != null &&
        nearLng != null &&
        Number.isFinite(nearLat) &&
        Number.isFinite(nearLng));

    if (!hasSignal) {
      setRelaxedGapFillAuctions([]);
      setRelaxedBackupProducts([]);
      setRelaxedGapFillLoading(false);
      return;
    }

    const mainCount = listForPagination.length;
    const needsGapFill = mainCount < TE_AR_PUTEA_INTERESA_THRESHOLD || mainCount === 0;

    if (!needsGapFill) {
      setRelaxedGapFillAuctions([]);
      if (realProducts.length > 0) setRelaxedBackupProducts([]);
      return;
    }

    if (locationGeocodeBusy) {
      setRelaxedGapFillAuctions([]);
      setRelaxedBackupProducts([]);
      setRelaxedGapFillLoading(false);
      return;
    }

    let cancelled = false;
    const mainIds = new Set(realProducts.map((p: Record<string, unknown>) => String(p?.id ?? "")));

    const run = async () => {
      setRelaxedGapFillLoading(true);
      const limit = Math.min(TE_AR_PUTEA_INTERESA_LIMIT_PER_REQUEST, TE_AR_PUTEA_INTERESA_MAX_ITEMS);
      try {
        const data = await fetchRelaxedRoListingsPage(0, limit, null);
        if (cancelled) return;
        const items: Record<string, unknown>[] = Array.isArray(data?.items) ? data.items : [];

        if (realProducts.length === 0) {
          setRelaxedBackupProducts(items.slice(0, TE_AR_PUTEA_INTERESA_MAX_ITEMS));
          setRelaxedGapFillAuctions([]);
        } else {
          setRelaxedBackupProducts([]);
          const collected = items
            .filter((item) => {
              const id = String(item?.id ?? "");
              return id && !mainIds.has(id);
            })
            .slice(0, TE_AR_PUTEA_INTERESA_MAX_ITEMS);
          setRelaxedGapFillAuctions(
            collected.map((prod) => ({
              ...convertProductToAuction(prod),
              __fromRelaxedGeo: true,
            })),
          );
        }
      } catch {
        if (!cancelled && realProducts.length === 0) setRelaxedBackupProducts([]);
      }
      if (!cancelled) setRelaxedGapFillLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isLoadingMoreRemote,
    listForPagination.length,
    realProducts,
    searchParams,
    filtersSignatureFromUrl,
    fetchRelaxedRoListingsPage,
    selectedBrand,
    selectedCategory,
    location,
    locationSearch,
    nearLat,
    nearLng,
    selectedLocations,
    locationGeocodeBusy,
  ]);

  // Grila canonică: doar rezultatele exacte; sugestiile relaxate rămân într-o secțiune separată.
  const displayedList = useMemo(() => {
    const exact = [...paginatedItems];
    if (nearLat == null || nearLng == null) return exact;
    return sortListingsByGeoDistance(exact, { lat: nearLat, lng: nearLng });
  }, [paginatedItems, nearLat, nearLng]);

  const relaxedSuggestionList = useMemo(() => {
    const relaxedBackupAuctions = relaxedBackupProducts.map((p) => ({
      ...convertProductToAuction(p),
      __fromRelaxedGeo: true,
    }));
    const suggestions = buildRelaxedSuggestionList(
      displayedList,
      [...relaxedGapFillAuctions, ...relaxedBackupAuctions],
      TE_AR_PUTEA_INTERESA_MAX_ITEMS,
    );
    if (nearLat == null || nearLng == null) return suggestions;
    return sortListingsByGeoDistance(suggestions, { lat: nearLat, lng: nearLng });
  }, [displayedList, relaxedGapFillAuctions, relaxedBackupProducts, nearLat, nearLng]);

  const [lastStableDisplayedList, setLastStableDisplayedList] = useState<any[]>([]);
  const lastStableDisplayedListSignatureRef = useRef("");

  useEffect(() => {
    lastStableDisplayedListSignatureRef.current = "";
    setLastStableDisplayedList([]);
  }, [listingsOffsetForFetch, listingsPageSize]);

  useEffect(() => {
    if (displayedList.length === 0) return;
    const signature = displayedList
      .map((item) => String((item as any)?.id ?? (item as any)?.slug ?? ""))
      .join("|");
    if (signature && signature !== lastStableDisplayedListSignatureRef.current) {
      lastStableDisplayedListSignatureRef.current = signature;
      setLastStableDisplayedList(displayedList);
    }
  }, [displayedList]);

  const isRefreshingDisplayedList =
    mounted &&
    displayedList.length === 0 &&
    lastStableDisplayedList.length > 0 &&
    (isLoadingMoreRemote || relaxedGapFillLoading || isGeoRadiusRefreshing || isPageNavigating || isRouteTransitionPending);
  const visibleDisplayedList = isRefreshingDisplayedList ? lastStableDisplayedList : displayedList;
  const listingDisplayState = getExplicitDisplayState({
    mounted,
    exactCount: visibleDisplayedList.length,
    relaxedCount: SHOW_RELAXED_SUGGESTIONS_SECTION ? relaxedSuggestionList.length : 0,
    loadingExact: isLoadingMoreRemote || isGeoRadiusRefreshing || isPageNavigating || isRouteTransitionPending,
    loadingRelaxed: SHOW_RELAXED_SUGGESTIONS_SECTION && relaxedGapFillLoading,
  });
  const shouldShowResultsSkeleton =
    visibleDisplayedList.length === 0 &&
    (listingDisplayState === "initial" ||
      listingDisplayState === "loadingExact" ||
      (listingDisplayState === "loadingRelaxed" && (!SHOW_RELAXED_SUGGESTIONS_SECTION || relaxedSuggestionList.length === 0)));
  const isMarketplaceDataPending =
    mounted &&
    visibleDisplayedList.length > 0 &&
    (isLoadingMoreRemote || relaxedGapFillLoading || isGeoRadiusRefreshing || isPageNavigating || isRouteTransitionPending);
  const isCompletingDisplayedResults =
    mounted &&
    visibleDisplayedList.length > 0 &&
    (relaxedGapFillLoading || isGeoRadiusRefreshing || isLoadingMoreRemote);
  const displayedRangeStart = visibleDisplayedList.length > 0 ? listingsOffsetForFetch + 1 : 0;
  const displayedRangeEnd = visibleDisplayedList.length > 0
    ? listingsOffsetForFetch + visibleDisplayedList.length
    : 0;
  const displayedRangeLabel =
    listingsOffsetForFetch > 0 && displayedRangeStart > 0
      ? `${displayedRangeStart.toLocaleString('ro-RO')}-${displayedRangeEnd.toLocaleString('ro-RO')}`
      : visibleDisplayedList.length.toLocaleString('ro-RO');

  /** Sufix „dintr-o rază de … km față de …” (sau doar „față de …” fără rază în UI) când există centru geo. */
  const geoSortSummaryParts = useMemo(() => {
    if (nearLat == null || nearLng == null || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) {
      return null;
    }
    const cityRaw =
      locationSearch.trim() ||
      (selectedLocations.length >= 1 ? selectedLocations[0] : "") ||
      (location && location !== "all" ? location : "");
    const cityLabel = cityRaw.trim() || "locația aleasă";
    const kmRounded =
      locationRadiusKm > 0
        ? Math.min(500, Math.max(1, Math.round(locationRadiusKm)))
        : null;
    return { cityLabel, kmRounded };
  }, [nearLat, nearLng, locationSearch, selectedLocations, location, locationRadiusKm]);

  const getAuctionDetailUrl = useCallback((auction: any): string => {
    return auction?.url || `/licitatii-publice/${auction?.slug || auction?.id}`;
  }, []);

  const getListingDomSelector = useCallback((listingId: string): string => {
    const escaped = listingId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `[data-ro-listing-id="${escaped}"]`;
  }, []);

  const readDocumentScrollY = useCallback((): number => {
    if (typeof window === "undefined") return 0;
    return Math.max(
      window.scrollY || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0,
    );
  }, []);

  const rememberRoListReturnState = useCallback((auction: any) => {
    if (typeof window === "undefined") return;
    restoredRoListReturnRef.current = false;
    const listingId = String(auction?.id ?? auction?.slug ?? "");
    const node = listingId
      ? document.querySelector<HTMLElement>(getListingDomSelector(listingId))
      : null;
    const itemTop = node?.getBoundingClientRect().top ?? null;
    try {
      const key = getRoReturnStateStorageKey();
      const payload = JSON.stringify({
        searchSignature: normalizeReturnSearchSignature(window.location.search),
        pathname: window.location.pathname,
        page: listingsUrlPage,
        offset: listingsOffset,
        limit: listingsPageSize,
        filtersSignature: filtersSignatureFromUrl,
        scrollY: readDocumentScrollY(),
        listingId,
        itemTop,
        ts: Date.now(),
      });
      window.sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    } catch {
      // Storage can be unavailable in private mode; browser back still works.
    }
  }, [
    filtersSignatureFromUrl,
    getListingDomSelector,
    listingsOffset,
    listingsPageSize,
    listingsUrlPage,
    readDocumentScrollY,
  ]);

  const openAuctionDetail = useCallback((auction: any) => {
    const href = getAuctionDetailUrl(auction);
    rememberRoListReturnState(auction);
    if (typeof window === "undefined") {
      router.push(href);
      return;
    }
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin) {
        router.push(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
    } catch {
      // Fall through to browser navigation for malformed/external URLs.
    }
    window.location.href = href;
  }, [getAuctionDetailUrl, rememberRoListReturnState, router]);

  // În grid: doar carduri, 2 col (mobil) sau 3 col (desktop) — aceeași ordine ca `displayedList` (merge + sort geo).
  const gridItemsWithPlacement = useMemo(() => {
    if (viewMode !== 'grid' || !visibleDisplayedList.length) return null;
    const result: { item: any; row: number; col: number }[] = [];
    let row = 0;
    let col = 1;
    const maxCol = isMobile ? 2 : 3;
    for (const item of visibleDisplayedList) {
      result.push({ item, row, col });
      col += 1;
      if (col > maxCol) {
        col = 1;
        row += 1;
      }
    }
    return result;
  }, [visibleDisplayedList, viewMode, isMobile]);

  const placementByItem = useMemo(() => {
    if (!gridItemsWithPlacement) return new Map<any, { row: number; col: number }>();
    const m = new Map<any, { row: number; col: number }>();
    gridItemsWithPlacement.forEach(({ item, row, col }) => m.set(item, { row, col }));
    return m;
  }, [gridItemsWithPlacement]);

  const rowHasBar = useMemo(() => {
    if (!gridItemsWithPlacement) return new Map<number, boolean>();
    const m = new Map<number, boolean>();
    gridItemsWithPlacement.forEach(({ item, row }) => {
      if ((item as any).__isBar) m.set(row, true);
    });
    return m;
  }, [gridItemsWithPlacement]);

  useEffect(() => {
    if (!mounted || restoredRoListReturnRef.current || visibleDisplayedList.length === 0) return;
    if (typeof window === "undefined") return;
    /** După back, așteaptă listă stabilă — altfel scroll-ul se calculează pe layout incomplet. */
    if (isLoadingMoreRemote || isPageNavigating || isRouteTransitionPending) return;

    let state: RoListingReturnPayload | null = null;
    const key = getRoReturnStateStorageKey();
    try {
      const raw = window.sessionStorage.getItem(key) ?? localStorage.getItem(key);
      state = raw ? (JSON.parse(raw) as RoListingReturnPayload) : null;
    } catch {
      state = null;
    }
    if (!state) return;
    if (state.pathname && state.pathname !== window.location.pathname) return;
    const currentSignature = normalizeReturnSearchSignature(window.location.search);
    if (state.searchSignature && state.searchSignature !== currentSignature) return;
    if (typeof state.page === "number" && state.page !== listingsUrlPage) return;
    if (typeof state.offset === "number" && state.offset !== listingsOffsetForFetch) return;
    if (typeof state.limit === "number" && state.limit !== listingsPageSize) return;
    if (typeof state.filtersSignature === "string" && state.filtersSignature !== filtersSignatureFromUrl) return;
    if (typeof state.ts === "number" && Date.now() - state.ts > RO_LISTING_RETURN_TTL_MS) {
      clearRoListingReturnState(key);
      return;
    }

    let attempts = 0;
    const maxAttempts = 28;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const followUpTimers: Array<number | ReturnType<typeof setTimeout>> = [];

    const listingId = String(state?.listingId ?? "");
    const savedTop = typeof state?.itemTop === "number" ? state.itemTop : null;

    /** Aliniază cardul la același offset în viewport ca la salvare (independent de scrollY inițial). */
    const nudgeCardToSavedViewportTop = (node: HTMLElement) => {
      if (savedTop == null) return;
      const top = node.getBoundingClientRect().top;
      const delta = top - savedTop;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.35) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    };

    const tryRestore = () => {
      attempts += 1;
      const scrollY = Number(state?.scrollY ?? 0);
      if (Number.isFinite(scrollY)) {
        window.scrollTo({ top: Math.max(0, scrollY), behavior: "auto" });
      }

      const applyFineScroll = (node: HTMLElement | null) => {
        if (node && savedTop != null) {
          nudgeCardToSavedViewportTop(node);
          restoredRoListReturnRef.current = true;
          clearRoListingReturnState(key);
          // După imagini / fonturi, refacem aceeași corecție (aceeași țintă: itemTop salvat).
          const scheduleFollowUp = (delay: number) => {
            const id = window.setTimeout(() => {
              const again = listingId
                ? document.querySelector<HTMLElement>(getListingDomSelector(listingId))
                : null;
              if (again) nudgeCardToSavedViewportTop(again);
            }, delay);
            followUpTimers.push(id);
          };
          scheduleFollowUp(120);
          scheduleFollowUp(380);
          scheduleFollowUp(900);
          scheduleFollowUp(1800);
          return;
        }
        if (node && savedTop == null && listingId) {
          window.scrollTo({ top: Math.max(0, scrollY), behavior: "auto" });
          try {
            node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          } catch {
            node.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
          restoredRoListReturnRef.current = true;
          clearRoListingReturnState(key);
          return;
        }
        if (!listingId || attempts >= maxAttempts) {
          if (Number.isFinite(scrollY)) {
            window.scrollTo({ top: Math.max(0, scrollY), behavior: "auto" });
          }
          restoredRoListReturnRef.current = true;
          clearRoListingReturnState(key);
          return;
        }
        timer = setTimeout(tryRestore, 90);
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const node = listingId
            ? document.querySelector<HTMLElement>(getListingDomSelector(listingId))
            : null;
          applyFineScroll(node);
        });
      });
    };

    timer = setTimeout(tryRestore, 0);
    return () => {
      if (timer) clearTimeout(timer);
      followUpTimers.forEach((id) => clearTimeout(id));
    };
  }, [
    filtersSignatureFromUrl,
    getListingDomSelector,
    isLoadingMoreRemote,
    isPageNavigating,
    isRouteTransitionPending,
    listingsOffsetForFetch,
    listingsPageSize,
    listingsUrlPage,
    mounted,
    visibleDisplayedList.length,
  ]);

  // loadMore removed (auto-load on scroll)

  const clearFilters = () => {
    setListingsScope('all');
    setIncludeExecutariCrosslist(false);
    setSelectedCategories([]);
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedSubcategories([]);
    setSelectedExecutariMainCategory('');
    setSelectedExecutariListCategory('');
    setSelectedExecutariListCategories([]);
    setSelectedLevel3('all');
    setSelectedPieseTipSlugs([]);
    setTipPiesaSearch('');
    setMarketplaceSearchText('');
    setBrandSearch('');
    setSelectedSize('all');
    setSelectedSizes([]);
    setSelectedBrand('all');
    setSelectedBrands([]);
    setSelectedModel('all');
    setSelectedModels([]);
    setSelectedColor('all');
    setSelectedColors([]);
    setPriceRange({ min: '', max: '' });
    setMarketplaceFreeOnly(false);
    setLocation('all');
    setSelectedLocations([]);
    setLocationCenterFromGps(false);
    setLocationSearch('');
    setNearLat(null);
    setNearLng(null);
    setLocationRadiusKm(0);
    setRemoteLocationRadiusKm(0);
    setCondition('all');
    setSelectedConditions([]);
    setImageFilter('all');
    setSelectedSellerKinds([]);
    setSortBy('relevant');
    setTimeRemainingFilter('');
    setDetailedFilters({
      rooms: '',
      surface: { min: '', max: '' },
      floor: { min: '', max: '' },
      buildingYear: { min: '', max: '' },
      city: '',
      county: '',
      country: 'România',
      landSurface: { min: '', max: '' },
      garden: false,
      garage: false,
      pool: false,
      terrainType: '',
      utilities: [],
      zoning: '',
      brand: '',
      model: '',
      year: { min: '', max: '' },
      mileage: { min: '', max: '' },
      capacitateCilindrica: { min: '', max: '' },
      fuelType: '',
      transmission: '',
      color: '',
      executionType: '',
      court: '',
      debtor: '',
      executionValue: { min: '', max: '' }
    });

    localStorage.removeItem('savedFilters');
    setMessage({ type: 'success', text: 'Filtrele au fost șterse cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const saveFilters = () => {
    const filtersToSave = {
      listingsScope,
      includeExecutariCrosslist,
      selectedCategory,
      selectedCategories,
      selectedSubcategory,
      selectedSubcategories,
      selectedExecutariMainCategory,
      selectedExecutariListCategory,
      selectedExecutariListCategories,
      selectedSize,
      selectedSizes,
      selectedBrand,
      selectedBrands,
      selectedModel,
      selectedModels,
      selectedColor,
      selectedColors,
      priceRange,
      selectedCurrency,
      location,
      selectedLocations,
      condition,
      selectedConditions,
      imageFilter,
      sortBy,
      timeRemainingFilter,
      detailedFilters
    };

    localStorage.setItem('savedFilters', JSON.stringify(filtersToSave));
  };

  const loadSavedFilters = () => {
    const urlHasCategory = typeof window !== 'undefined' && (() => {
      const params = new URLSearchParams(window.location.search);
      const urlCat = params.get('category')?.trim().toLowerCase();
      const urlCats = params.get('categories')?.trim().toLowerCase();
      const urlSub = params.get('subcategory')?.trim().toLowerCase();
      const urlSubs = params.get('subcategories')?.trim().toLowerCase();
      const hasMulti = !!(urlCats && urlCats.split(',').some((c) => !!categories[c.trim() as keyof typeof categories]));
      const hasSub = !!urlSub || !!urlSubs;
      return hasSub || hasMulti || !!(urlCat && categories[urlCat as keyof typeof categories]);
    })();
    const savedFilters = localStorage.getItem('savedFilters');
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters);
        if (filters.listingsScope === 'live_bid' || filters.listingsScope === 'executari') {
          setListingsScope(filters.listingsScope);
        }
        setIncludeExecutariCrosslist(filters.includeExecutariCrosslist === true);
        if (!urlHasCategory) {
          setSelectedCategories(Array.isArray(filters.selectedCategories) ? filters.selectedCategories : []);
          setSelectedCategory(filters.selectedCategory || 'all');
          setSelectedSubcategory(filters.selectedSubcategory || 'all');
          setSelectedSubcategories(Array.isArray(filters.selectedSubcategories) ? filters.selectedSubcategories : []);
          setSelectedExecutariMainCategory(filters.selectedExecutariMainCategory || '');
          setSelectedExecutariListCategory(filters.selectedExecutariListCategory || '');
          setSelectedExecutariListCategories(
            Array.isArray(filters.selectedExecutariListCategories)
              ? filters.selectedExecutariListCategories
              : (filters.selectedExecutariListCategory ? [filters.selectedExecutariListCategory] : [])
          );
        }
        setSelectedBrand(filters.selectedBrand || 'all');
        setSelectedBrands(Array.isArray(filters.selectedBrands) ? filters.selectedBrands : []);
        setSelectedModel(filters.selectedModel || 'all');
        setSelectedModels(Array.isArray(filters.selectedModels) ? filters.selectedModels : []);
        setSelectedColor(filters.selectedColor || 'all');
        setSelectedColors(Array.isArray(filters.selectedColors) ? filters.selectedColors : []);
        setSelectedSize(filters.selectedSize || 'all');
        setSelectedSizes(Array.isArray(filters.selectedSizes) ? filters.selectedSizes : []);
        setPriceRange(filters.priceRange || { min: '', max: '' });
        setSelectedCurrency(filters.selectedCurrency === 'EUR' ? 'EUR' : 'RON');
        setLocation(filters.location || 'all');
        setSelectedLocations(Array.isArray(filters.selectedLocations) ? filters.selectedLocations : []);
        setCondition(filters.condition || 'all');
        setSelectedConditions(Array.isArray(filters.selectedConditions) ? filters.selectedConditions : []);
        setImageFilter(filters.imageFilter === 'with' ? 'with' : 'all');
        setSortBy(filters.sortBy || 'relevant');
        setTimeRemainingFilter(filters.timeRemainingFilter || '');
        setDetailedFilters(filters.detailedFilters || {
          rooms: '',
          surface: { min: '', max: '' },
          floor: { min: '', max: '' },
          buildingYear: { min: '', max: '' },
          city: '',
          county: '',
          country: 'România',
          landSurface: { min: '', max: '' },
          garden: false,
          garage: false,
          pool: false,
          terrainType: '',
          utilities: [],
          zoning: '',
          brand: '',
          model: '',
          year: { min: '', max: '' },
          mileage: { min: '', max: '' },
          fuelType: '',
          transmission: '',
          color: '',
          executionType: '',
          court: '',
          debtor: '',
          executionValue: { min: '', max: '' }
        });
      } catch (error) {
        console.error('Error loading saved filters:', error);
      }
    }
  };

  // Avoid hydration issues: compute this client-side only
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasSavedFilters(!!localStorage.getItem('savedFilters'));
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'savedFilters') {
        setHasSavedFilters(!!e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Doar categorii ca butoane – pentru modalul mobil; la selectare închide filtrul
  const renderFiltersCategoriesOnly = () => {
    const normalizedSelection = activeSelectedCategories.filter((c) => c !== 'all');
    const toggleCategory = (catKey: string) => {
      // Mod mobil: dacă Multi Select este activ, nu închidem modalul la selectare.
      if (mobileCategoryMultiSelectEnabled) {
        if (catKey === 'all') {
          setSelectedCategories([]);
          setSelectedCategory('all');
          setSelectedSubcategory('all');
          setSelectedSubcategories([]);
          setSelectedLevel3('all');
          setSelectedSize('all');
          setSelectedSizes([]);
          setSelectedBrand('all');
          setSelectedBrands([]);
          setSelectedColor('all');
          setSelectedColors([]);
          setSelectedExecutariMainCategory('');
          setSelectedExecutariListCategory('');
          setSelectedExecutariListCategories([]);
          setTimeRemainingFilter('');
          return;
        }
        const next = normalizedSelection.includes(catKey)
          ? normalizedSelection.filter((c) => c !== catKey)
          : [...normalizedSelection, catKey];
        const deduped = Array.from(new Set(next));
        setSelectedCategories(deduped);
        if (deduped.length === 0) {
          setSelectedCategory('all');
        } else if (deduped.length === 1) {
          setSelectedCategory(deduped[0]);
        } else {
          setSelectedCategory('all');
        }
        setSelectedSubcategory('all');
        setSelectedSubcategories([]);
        setSelectedLevel3('all');
        setSelectedSize('all');
        setSelectedSizes([]);
        setSelectedBrand('all');
        setSelectedBrands([]);
        setSelectedColor('all');
        setSelectedColors([]);
        setSelectedExecutariMainCategory('');
        setSelectedExecutariListCategory('');
        setSelectedExecutariListCategories([]);
        setTimeRemainingFilter('');
        return;
      }

      if (catKey === 'all') {
        setSelectedCategories([]);
        setSelectedCategory('all');
        setSelectedSubcategory('all');
        setSelectedSubcategories([]);
        setSelectedLevel3('all');
        setSelectedSize('all');
        setSelectedSizes([]);
        setSelectedBrand('all');
        setSelectedBrands([]);
        setSelectedColor('all');
        setSelectedColors([]);
        setSelectedExecutariMainCategory('');
        setSelectedExecutariListCategory('');
        setSelectedExecutariListCategories([]);
        setTimeRemainingFilter('');
        setMobileCategoryMultiSelectEnabled(false);
        setShowFilters(false);
        return;
      }
      // Fără multi-select: o singură categorie activă – selectarea alteia o înlocuiește (debifează pe cea veche)
      const next = normalizedSelection.includes(catKey)
        ? normalizedSelection.filter((c) => c !== catKey)
        : [catKey];
      setSelectedCategories(next);
      if (next.length === 0) {
        setSelectedCategory('all');
      } else if (next.length === 1) {
        setSelectedCategory(next[0]);
      } else {
        setSelectedCategory('all');
      }
      setSelectedSubcategory('all');
      setSelectedSubcategories([]);
      setSelectedLevel3('all');
      setSelectedSize('all');
      setSelectedSizes([]);
      setSelectedBrand('all');
      setSelectedBrands([]);
      setSelectedColor('all');
      setSelectedColors([]);
      setSelectedExecutariMainCategory('');
      setSelectedExecutariListCategory('');
      setSelectedExecutariListCategories([]);
      setTimeRemainingFilter('');
      setMobileCategoryMultiSelectEnabled(false);
      setShowFilters(false);
    };

    const clearSubcategoryDependents = () => {
      setSelectedLevel3('all');
      setSelectedPieseTipSlugs([]);
      setSelectedSize('all');
      setSelectedSizes([]);
      setSelectedBrand('all');
      setSelectedBrands([]);
      setSelectedModel('all');
      setSelectedModels([]);
      setSelectedColor('all');
      setSelectedColors([]);
    };

    const toggleSubcategory = (subcat: string) => {
      setSelectedSubcategories((prev) => {
        const base =
          prev.length > 0 ? prev : selectedSubcategory !== 'all' ? [selectedSubcategory] : [];
        const exists = base.includes(subcat);
        const next = exists ? base.filter((s) => s !== subcat) : [...base, subcat];
        const deduped = Array.from(new Set(next));
        setSelectedSubcategory(deduped.length === 1 ? deduped[0] : 'all');
        clearSubcategoryDependents();
        return deduped;
      });
    };

    const chipBase =
      'flex w-full min-w-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition-all sm:rounded-xl sm:px-2.5 sm:py-1.5 sm:text-xs sm:leading-normal';
    const subcatList =
      selectedCategory !== 'all'
        ? categories[selectedCategory as keyof typeof categories]?.subcategories ?? []
        : [];

    return (
      <div className="flex flex-col gap-3 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => toggleCategory('all')}
            className={`${chipBase} col-span-2 justify-center text-center ${normalizedSelection.length === 0
              ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
              : isDarkMode
                ? 'border-gray-600 bg-gray-700/90 text-gray-200 hover:bg-gray-600'
                : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
              }`}
          >
            Toate
          </button>
          {Object.entries(categories)
            .filter(([k]) => k !== 'all')
            .map(([key, cat]) => {
              const checked = normalizedSelection.includes(key);
              return (
                <label
                  key={`cat-${key}`}
                  className={`${chipBase} cursor-pointer ${checked
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : isDarkMode
                      ? 'border-gray-600 bg-gray-700/90 text-gray-200 hover:bg-gray-600'
                      : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(key)}
                    className={`${checked ? 'border-white/40 bg-white/20 accent-white' : 'accent-orange-500'} size-3 shrink-0 rounded border-gray-300 sm:size-3.5`}
                  />
                  <span className="min-w-0 flex-1 hyphens-auto break-words [overflow-wrap:anywhere]">
                    {cat.name}
                    {SHOW_FILTER_OPTION_COUNTS ? (
                      <span className={`opacity-80 ${checked ? 'text-white/90' : ''}`}>
                        {' '}
                        ({categoryCountsFromDb[key] ?? 0})
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
        </div>

        {mobileCategoryMultiSelectEnabled && normalizedSelection.length > 1 ? (
          <p
            className={`text-center text-[11px] leading-snug ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}
          >
            Pentru subcategorii, rămâi cu o singură categorie selectată.
          </p>
        ) : null}

        {selectedCategory !== 'all' && subcatList.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p
              className={`text-center text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}
            >
              Subcategorie
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSubcategory('all');
                  setSelectedSubcategories([]);
                  clearSubcategoryDependents();
                }}
                className={`${chipBase} col-span-2 justify-center text-center ${
                  activeSelectedSubcategories.length === 0
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : isDarkMode
                      ? 'border-gray-600 bg-gray-700/90 text-gray-200 hover:bg-gray-600'
                      : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                Toate subcategoriile
              </button>
              {subcatList.map((subcat) => {
                const checked = activeSelectedSubcategories.includes(subcat);
                return (
                  <label
                    key={`mobile-cat-sheet-sub-${subcat}`}
                    className={`${chipBase} cursor-pointer ${
                      checked
                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                        : isDarkMode
                          ? 'border-gray-600 bg-gray-700/90 text-gray-200 hover:bg-gray-600'
                          : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubcategory(subcat)}
                      className={`${
                        checked ? 'border-white/40 bg-white/20 accent-white' : 'accent-orange-500'
                      } size-3 shrink-0 rounded border-gray-300 sm:size-3.5`}
                    />
                    <span className="min-w-0 flex-1 hyphens-auto break-words [overflow-wrap:anywhere]">
                      {subcategoryNames[subcat as keyof typeof subcategoryNames] ?? subcat}
                      {SHOW_FILTER_OPTION_COUNTS ? (
                        <span className={`opacity-80 ${checked ? 'text-white/90' : ''}`}>
                          {' '}
                          ({subcategoryCountsFromDb[subcat] ?? 0})
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={() => {
              if (mobileCategoryMultiSelectEnabled) return;
              setMobileCategoryMultiSelectEnabled(true);
            }}
            className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors sm:min-h-0 sm:flex-1 sm:rounded-xl sm:py-2.5 sm:text-sm ${mobileCategoryMultiSelectEnabled
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            {mobileCategoryMultiSelectEnabled
              ? 'Multi select activ'
              : 'Activează multi selectare'}
          </button>
          {mobileCategoryMultiSelectEnabled && (
            <button
              type="button"
              onClick={() => {
                setMobileCategoryMultiSelectEnabled(false);
                setShowFilters(false);
              }}
              className="w-full rounded-lg bg-orange-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600 sm:flex-1 sm:rounded-xl sm:py-2.5 sm:text-sm"
            >
              Salvează selecția
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFilterModalMode('precise')}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors sm:gap-2 sm:rounded-xl sm:py-2.5 sm:text-sm ${isDarkMode ? 'border-orange-500/50 text-orange-400 hover:bg-orange-500/15' : 'border-orange-300 text-orange-600 hover:bg-orange-50'
            }`}
        >
          <i className="ri-filter-3-line text-base sm:text-lg" aria-hidden />
          Filtre mai precise
        </button>
      </div>
    );
  };

  // Render filters content (used in desktop sidebar and mobile "filtre mai precise")
  // skipCategories=true: pe mobil – fără Categorie/Subcategorie din sidebar (sunt în primul sheet). Listele (Mărime, Marcă, …) = aceleași ca desktop.
  // mobileSheetLayout: sheet „Filtre” — restul sub „Filtrări avansate”; fără butoanele de jos din listă (footer în Sheet).
  // hideLocation: ascunde secțiunea Locație din top (folosit când e wrapped sub bundle marketplace mobil).
  const renderFiltersContent = (skipCategories = false, mobileSheetLayout = false, hideLocation = false) => {
    // Evită mismatch SSR/CSR pentru blocul mare de filtre (select/checkbox/toggle-uri dinamice).
    if (!mounted) {
      return (
        <div className="space-y-5" suppressHydrationWarning>
          <div className="h-16 rounded-xl bg-gray-100/90 dark:bg-gray-800/80" />
          <div className="h-16 rounded-xl bg-gray-100/90 dark:bg-gray-800/80" />
          <div className="h-16 rounded-xl bg-gray-100/90 dark:bg-gray-800/80" />
        </div>
      );
    }
    const selectBase = `w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-all appearance-none cursor-pointer pr-10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0`;
    const selectStyle = (hasValue: boolean) => hasValue
      ? isDarkMode ? 'border-primary/50 bg-primary/15 text-white' : 'border-primary/40 bg-accent/80 text-foreground'
      : isDarkMode ? 'border-border bg-muted/25 text-white hover:bg-muted/40' : 'border-border bg-background hover:bg-muted/40';
    const inputStyle = isDarkMode
      ? 'border-border bg-muted/25 text-white placeholder:text-muted-foreground'
      : 'border-border bg-background text-foreground placeholder:text-muted-foreground';
    /** Liste (nu Categorie/Subcategorie): max ~10 rânduri vizibile, restul scroll în zonă */
    const filterCheckboxListScrollClass = 'max-h-72 overflow-y-auto space-y-1 pr-1';
    const imagesSwitchId = mobileSheetLayout
      ? 'mobile-sheet-filters'
      : skipCategories
        ? 'mobile-images-switch'
        : 'desktop-images-switch';

    const renderExecutariCategoryExtras = () => {
      if (selectedCategory !== 'executari') return null;
      return (
        <>
          <RoFilterSection title="Mai multe detalii" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={activeSelectedExecutariListCategories.length === 0}
                  onChange={() => {
                    setSelectedExecutariListCategory('');
                    setSelectedExecutariListCategories([]);
                  }}
                  className="accent-orange-500"
                />
                Toate detaliile
              </label>
              <div className={filterCheckboxListScrollClass}>
                {executariListCategoryOptions.map((cat) => {
                  const checked = activeSelectedExecutariListCategories.includes(cat);
                  return (
                    <label key={`exec-list-cat-${cat}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedExecutariListCategories((prev) => {
                            const base = prev.length > 0
                              ? prev
                              : (selectedExecutariListCategory ? [selectedExecutariListCategory] : []);
                            const exists = base.includes(cat);
                            const next = exists ? base.filter((s) => s !== cat) : [...base, cat];
                            const deduped = Array.from(new Set(next));
                            setSelectedExecutariListCategory(deduped.length === 1 ? deduped[0] : '');
                            return deduped;
                          });
                        }}
                        className="accent-orange-500"
                      />
                      {cat}
                    </label>
                  );
                })}
              </div>
            </div>
          </RoFilterSection>
          {activeSelectedExecutariListCategories.includes('Terenuri') && (
            <RoFilterSection title="Tip teren" isDarkMode={isDarkMode}>
              <div className="space-y-2">
                <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="radio"
                    name="exec-teren-level4"
                    checked={selectedLevel3 === 'all'}
                    onChange={() => setSelectedLevel3('all')}
                    className="accent-orange-500"
                  />
                  Toate tipurile
                </label>
                <div className={filterCheckboxListScrollClass}>
                  {[
                    { slug: 'terenuri-intravilane', label: 'Intravilan' },
                    { slug: 'terenuri-extravilane', label: 'Extravilan' },
                  ].map(({ slug, label }) => (
                    <label key={slug} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="radio"
                        name="exec-teren-level4"
                        checked={selectedLevel3 === slug}
                        onChange={() => setSelectedLevel3(slug)}
                        className="accent-orange-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </RoFilterSection>
          )}
        </>
      );
    };

    return (
      <div className="space-y-0">
        {!hideLocation ? (
        <RoFilterSection title="Locație" isDarkMode={isDarkMode} defaultOpen={true}>
          <div className="space-y-3">
            <div className="relative">
              <MapPin className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" aria-hidden />
              <LocationFilterAutocompleteInput
                value={locationSearch}
                onChange={handleLocationSearchChange}
                isDarkMode={isDarkMode}
                inputClassName="h-9 pl-9"
                placeholder="Caută localitate, ex. Craiova, Segarcea, București…"
                aria-label="Caută localitate"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  Rază maximă:{" "}
                  {locationRadiusKm <= 0
                    ? "fără limită (toată țara, sortare după distanță)"
                    : `${locationRadiusKm} km`}
                </Label>
                {locationGeocodeBusy ? (
                  <LoaderCircle className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : nearLat != null && nearLng != null ? (
                  <span className={`text-xs ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>Locație aprox. salvată</span>
                ) : null}
              </div>
              {mobileSheetLayout ? (
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={locationRadiusKm}
                  disabled={nearLat == null || nearLng == null}
                  onChange={(e) =>
                    setLocationRadiusKm(Math.max(0, Math.min(200, Number((e.target as HTMLInputElement).value) || 0)))
                  }
                  aria-label="Rază maximă în kilometri"
                  className="h-2 w-full cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              ) : (
                <Slider
                  min={0}
                  max={200}
                  step={5}
                  value={[locationRadiusKm]}
                  onValueChange={(v) => setLocationRadiusKm(Math.max(0, Math.min(200, v[0] ?? 0)))}
                  disabled={nearLat == null || nearLng == null}
                  aria-label="Rază maximă în kilometri"
                  className="w-full py-1"
                />
              )}
              <div className={`flex justify-between text-xs ${isDarkMode ? "text-gray-500" : "text-muted-foreground"}`}>
                <span>Fără limită</span>
                <span>200 km</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={useMyLocationBusy}
              onClick={() => {
                applyMyLocationCenter({ closeMobileSheet: false });
              }}
            >
              {useMyLocationBusy ? (
                <LoaderCircle className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              Folosește locația mea
            </Button>
            <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}>
              <input
                type="checkbox"
                checked={selectedLocations.length === 0}
                onChange={() => {
                  setLocationCenterFromGps(false);
                  setLocation("all");
                  setSelectedLocations([]);
                }}
                className="accent-orange-500"
              />
              Toate locațiile
            </label>
            <div className={filterCheckboxListScrollClass}>
              {filteredLocationOptions.map((city) => {
                const checked = selectedLocations.includes(city);
                return (
                  <label key={`loc-primary-${city}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? selectedLocations.filter((l) => l !== city) : [...selectedLocations, city];
                        setSelectedLocations(next);
                        setLocation(next.length === 1 ? next[0] : "all");
                      }}
                      className="accent-orange-500"
                    />
                    <span>{city}</span>
                    <span className="opacity-70">({locationCountsFromDb[city] ?? 0})</span>
                  </label>
                );
              })}
            </div>
          </div>
        </RoFilterSection>
        ) : null}
        {!skipCategories && (
          <>
            {/* Scope: exclude token / doar Executări – ascuns deocamdată */}
            {false && (
              <div className="space-y-2 mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={listingsScope === 'live_bid'}
                    onChange={() => {
                      const next = listingsScope === 'live_bid' ? 'all' : 'live_bid';
                      setListingsScope(next);
                      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                      if (next === 'all') params.delete('scope'); else params.set('scope', next);
                      router.replace(`/ro?${params.toString()}`, { scroll: false });
                    }}
                    className="accent-orange-500"
                  />
                  Exclude anunțurile cu tokeni
                </label>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Afișează doar anunțuri live_bid (fără Executări și Insolvență)
                </p>
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={listingsScope === 'executari'}
                    onChange={() => {
                      const next = listingsScope === 'executari' ? 'all' : 'executari';
                      setListingsScope(next);
                      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                      if (next === 'all') params.delete('scope'); else params.set('scope', next);
                      router.replace(`/ro?${params.toString()}`, { scroll: false });
                    }}
                    className="accent-orange-500"
                  />
                  Doar Executări și Insolvență
                </label>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Afișează doar licitații publice (fără anunțuri live_bid)
                </p>
              </div>
            )}
            {/* Category + subcategory DB counts: isolated Suspense boundary (Phase 2.4). */}
            <Suspense fallback={null}>
            <RoFilterSection title="Categorie" isDarkMode={isDarkMode}>
              <div className="space-y-2">
                <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={activeSelectedCategories.length === 0}
                    onChange={() => {
                      setSelectedCategories([]);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                      setSelectedSubcategories([]);
                      setSelectedLevel3('all');
                      setSelectedExecutariMainCategory('');
                      setSelectedExecutariListCategory('');
                      setSelectedExecutariListCategories([]);
                    }}
                    className="accent-orange-500"
                  />
                  Toate categoriile
                </label>
                {categoryKeys.map((key) => {
                  const checked = activeSelectedCategories.includes(key);
                  return (
                    <label key={`desktop-cat-${key}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedCategories((prev) => {
                            const base = prev.length > 0
                              ? prev.filter((c) => c !== 'all')
                              : (selectedCategory !== 'all' ? [selectedCategory] : []);
                            const exists = base.includes(key);
                            const next = exists ? base.filter((c) => c !== key) : [...base, key];
                            const deduped = Array.from(new Set(next));
                            if (deduped.length === 0) setSelectedCategory('all');
                            else if (deduped.length === 1) setSelectedCategory(deduped[0]);
                            else setSelectedCategory('all');
                            setSelectedSubcategory('all');
                            setSelectedSubcategories([]);
                            setSelectedLevel3('all');
                            setSelectedSize('all');
                            setSelectedSizes([]);
                            setSelectedBrand('all');
                            setSelectedBrands([]);
                            setSelectedModel('all');
                            setSelectedModels([]);
                            setSelectedColor('all');
                            setSelectedColors([]);
                            setSelectedExecutariMainCategory('');
                            setSelectedExecutariListCategory('');
                            setSelectedExecutariListCategories([]);
                            if (deduped.length === 0 || !deduped.includes('executari')) {
                              setTimeRemainingFilter('');
                            }
                            return deduped;
                          });
                        }}
                        className="accent-orange-500"
                      />
                      {(categories[key as keyof typeof categories]?.name ?? key)}
                      {SHOW_FILTER_OPTION_COUNTS ? <span className="opacity-70"> ({categoryCountsFromDb[key] ?? 0})</span> : null}
                    </label>
                  );
                })}
              </div>
            </RoFilterSection>

            <RoFilterSection title="Subcategorie" isDarkMode={isDarkMode}>
              <div className={`space-y-2 ${selectedCategory === 'all' ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={activeSelectedSubcategories.length === 0}
                    onChange={() => {
                      setSelectedSubcategory('all');
                      setSelectedSubcategories([]);
                      setSelectedLevel3('all');
                      syncSubcategoriesToUrl([]);
                      setSelectedSize('all');
                      setSelectedSizes([]);
                      setSelectedBrand('all');
                      setSelectedBrands([]);
                      setSelectedModel('all');
                      setSelectedModels([]);
                      setSelectedColor('all');
                      setSelectedColors([]);
                    }}
                    className="accent-orange-500"
                  />
                  Toate subcategoriile
                </label>
                {selectedCategory !== 'all' &&
                  categories[selectedCategory as keyof typeof categories].subcategories.map((subcat) => {
                    const checked = activeSelectedSubcategories.includes(subcat);
                    return (
                      <label key={`desktop-sub-${subcat}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const base = selectedSubcategories.length > 0
                              ? selectedSubcategories
                              : (selectedSubcategory !== 'all' ? [selectedSubcategory] : []);
                            const exists = base.includes(subcat);
                            const next = exists ? base.filter((s) => s !== subcat) : [...base, subcat];
                            const deduped = Array.from(new Set(next));
                            setSelectedSubcategories(deduped);
                            setSelectedSubcategory(deduped.length === 1 ? deduped[0] : 'all');
                            setSelectedLevel3('all');
                            syncSubcategoriesToUrl(deduped);
                            setSelectedSize('all');
                            setSelectedSizes([]);
                            setSelectedBrand('all');
                            setSelectedBrands([]);
                            setSelectedModel('all');
                            setSelectedModels([]);
                            setSelectedColor('all');
                            setSelectedColors([]);
                          }}
                          className="accent-orange-500"
                        />
                        {subcategoryNames[subcat as keyof typeof subcategoryNames]}
                        {SHOW_FILTER_OPTION_COUNTS ? <span className="opacity-70"> ({subcategoryCountsFromDb[subcat] ?? 0})</span> : null}
                      </label>
                    );
                  })}
              </div>
            </RoFilterSection>
            </Suspense>
            {!mobileSheetLayout && renderExecutariCategoryExtras()}

          </>
        )}

        {/* Subcategorie pe mobil: în primul sheet (Categorii), nu în „Filtre mai precise” */}
        {skipCategories && !mobileSheetLayout && selectedCategory === 'executari' && selectedSubcategory !== 'utilaje-echipamente' && selectedExecutariMainCategory !== 'Utilaje & Echipamente' && (
          <RoFilterSection title="Mai multe detalii" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={activeSelectedExecutariListCategories.length === 0}
                  onChange={() => {
                    setSelectedExecutariListCategory('');
                    setSelectedExecutariListCategories([]);
                  }}
                  className="accent-orange-500"
                />
                Toate detaliile
              </label>
              <div className={filterCheckboxListScrollClass}>
                {executariListCategoryOptions.map((cat) => {
                  const checked = activeSelectedExecutariListCategories.includes(cat);
                  return (
                    <label key={`mobile-exec-list-cat-${cat}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedExecutariListCategories((prev) => {
                            const base = prev.length > 0
                              ? prev
                              : (selectedExecutariListCategory ? [selectedExecutariListCategory] : []);
                            const exists = base.includes(cat);
                            const next = exists ? base.filter((s) => s !== cat) : [...base, cat];
                            const deduped = Array.from(new Set(next));
                            setSelectedExecutariListCategory(deduped.length === 1 ? deduped[0] : '');
                            return deduped;
                          });
                        }}
                        className="accent-orange-500"
                      />
                      {cat}
                    </label>
                  );
                })}
              </div>
            </div>
          </RoFilterSection>
        )}
        {skipCategories && !mobileSheetLayout && selectedCategory === 'executari' && activeSelectedExecutariListCategories.includes('Terenuri') && (
          <RoFilterSection title="Tip teren" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <input type="radio" name="mobile-exec-teren-level4" checked={selectedLevel3 === 'all'} onChange={() => setSelectedLevel3('all')} className="accent-orange-500" />
                Toate tipurile
              </label>
              <div className={filterCheckboxListScrollClass}>
                {[
                  { slug: 'terenuri-intravilane', label: 'Intravilan' },
                  { slug: 'terenuri-extravilane', label: 'Extravilan' },
                ].map(({ slug, label }) => (
                  <label key={slug} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    <input type="radio" name="mobile-exec-teren-level4" checked={selectedLevel3 === slug} onChange={() => setSelectedLevel3(slug)} className="accent-orange-500" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </RoFilterSection>
        )}

        {(() => {
          const advancedFiltersInner = (
            <>
        {/* Mărime (XS, S, M, L, XL) – același model ca Categorie / Subcategorie */}
        {effectiveSelectedSubcategory !== 'all' && getSizeOptions(effectiveSelectedSubcategory).length > 0 && (
          <RoFilterSection title="Mărime" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <div className={filterCheckboxListScrollClass}>
                {getSizeOptions(effectiveSelectedSubcategory).map((s) => {
                  const checked = selectedSizes.includes(s);
                  return (
                    <label key={`size-${s}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selectedSizes.filter((v) => v !== s) : [...selectedSizes, s];
                          setSelectedSizes(next);
                          setSelectedSize(next.length === 1 ? next[0] : 'all');
                        }}
                        className="accent-orange-500"
                      />
                      <span>{s}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </RoFilterSection>
        )}

        {/* Marca – identic cu Subcategorie; singura diferență: câmp de căutare deasupra listei */}
        {effectiveSelectedSubcategory !== 'all' && getBrandOptionsForSubcategory(effectiveSelectedSubcategory).length > 0 && (
          <RoFilterSection title="Marca" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Caută marcă..."
                className={`w-full rounded-lg border px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 ${inputStyle}`}
                aria-label="Caută marcă"
              />
              <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={selectedBrands.length === 0}
                  onChange={() => {
                    setSelectedBrand('all');
                    setSelectedBrands([]);
                    setSelectedModel('all');
                    setSelectedModels([]);
                  }}
                  className="accent-orange-500"
                />
                Toate mărcile
              </label>
              <div className={filterCheckboxListScrollClass}>
                {filteredBrandOptions.map((b) => {
                  const checked = selectedBrands.includes(b);
                  return (
                    <label key={`brand-${b}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selectedBrands.filter((v) => v !== b) : [...selectedBrands, b];
                          setSelectedBrands(next);
                          setSelectedBrand(next.length === 1 ? next[0] : 'all');
                          setSelectedModel('all');
                          setSelectedModels([]);
                        }}
                        className="accent-orange-500"
                      />
                      <span>{b}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </RoFilterSection>
        )}

        {/* Model – același model ca Categorie / Subcategorie */}
        {effectiveSelectedSubcategory !== 'all' && hasSelectedBrandFilter && modelOptionsForSelectedBrands.length > 0 && (
          <RoFilterSection title="Model" isDarkMode={isDarkMode}>
            <div className="space-y-2">
              <div className={filterCheckboxListScrollClass}>
                {modelOptionsForSelectedBrands.map((m) => {
                  const checked = selectedModels.includes(m);
                  return (
                    <label key={`model-${m}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selectedModels.filter((v) => v !== m) : [...selectedModels, m];
                          setSelectedModels(next);
                          setSelectedModel(next.length === 1 ? next[0] : 'all');
                        }}
                        className="accent-orange-500"
                      />
                      <span>{m}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </RoFilterSection>
        )}

        {/* Piese auto – Tip piesă: același layout ca Subcategorie + search */}
        {effectiveSelectedSubcategory === 'piese-auto' &&
          (filterSchema.level3BySubcategory['piese-auto']?.length ?? 0) > 0 && (
            <RoFilterSection title="Tip piesă" isDarkMode={isDarkMode}>
              <div className="space-y-2">
                <input
                  type="text"
                  value={tipPiesaSearch}
                  onChange={(e) => setTipPiesaSearch(e.target.value)}
                  placeholder="Caută tip piesă..."
                  className={`w-full rounded-lg border px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 ${inputStyle}`}
                  aria-label="Caută tip piesă"
                />
                <label className={`flex items-center gap-2 text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={selectedPieseTipSlugs.length === 0}
                    onChange={() => setSelectedPieseTipSlugs([])}
                    className="accent-orange-500"
                  />
                  Toate tipurile
                </label>
                <div className={filterCheckboxListScrollClass}>
                  {filteredPieseTipSlugs.map((slug) => {
                    const label = filterSchema.level3LabelsBySubcategory?.['piese-auto']?.[slug] ?? slug;
                    const checked = selectedPieseTipSlugs.includes(slug);
                    return (
                      <label
                        key={`piese-l3-${slug}`}
                        className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedPieseTipSlugs((prev) => {
                              const exists = prev.includes(slug);
                              const next = exists ? prev.filter((s) => s !== slug) : [...prev, slug];
                              return Array.from(new Set(next));
                            });
                          }}
                          className="accent-orange-500"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </RoFilterSection>
          )}

        {/* Culoare */}
        {effectiveSelectedSubcategory !== 'all' && (() => {
          const attrs = getAttributesForSubcategory(effectiveSelectedSubcategory);
          return attrs.color ? (
            <RoFilterSection title="Culoare" isDarkMode={isDarkMode}>
              <div className="space-y-2">
                <div className={filterCheckboxListScrollClass}>
                  {COLOR_OPTIONS.map((c) => {
                    const checked = selectedColors.includes(c);
                    return (
                      <label key={`color-${c}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? selectedColors.filter((v) => v !== c) : [...selectedColors, c];
                            setSelectedColors(next);
                            setSelectedColor(next.length === 1 ? next[0] : 'all');
                          }}
                          className="accent-orange-500"
                        />
                        <span>{c}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </RoFilterSection>
          ) : null;
        })()}

        {(() => {
          const setariInner = (
            <>
        {/* Preț, monedă, stare: doar în RoMobileMarketplaceFilters (sus) — aici doar restul */}

        {/* Pe mobil, Poze e în rândul unificat deasupra listei — în sheet-ul „Filtre” o afișăm în filtrări avansate */}
        <div className={mobileSheetLayout ? "block" : "hidden lg:block"}>
          <RoFilterSection title="Poze" isDarkMode={isDarkMode}>
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                isDarkMode
                  ? 'border-white/15 bg-white/5'
                  : 'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <label htmlFor={imagesSwitchId} className="min-w-0 cursor-pointer">
                  <p className={`text-[15px] font-semibold leading-tight ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    Doar anunțuri cu poze
                  </p>
                  <p className={`mt-0.5 text-xs leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Ascunde anunțurile fără imagini
                  </p>
                </label>

                <button
                  id={imagesSwitchId}
                  type="button"
                  role="switch"
                  aria-checked={imageFilter === 'with'}
                  aria-label="Doar anunțuri cu poze"
                  onClick={() => setImageFilter((prev) => (prev === 'with' ? 'all' : 'with'))}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    imageFilter === 'with'
                      ? (isDarkMode ? "bg-orange-500" : "bg-orange-500")
                      : (isDarkMode ? "bg-white/10" : "bg-gray-200")
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200",
                      imageFilter === 'with' ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </RoFilterSection>
        </div>

        <RoFilterSection title="Tipul vânzătorului" isDarkMode={isDarkMode}>
          <div className="space-y-1">
            {(['particular', 'companie'] as const).map((kind) => {
              const checked = selectedSellerKinds.includes(kind);
              const label = kind === 'particular' ? 'Particular' : 'Companie';
              return (
                <label key={`seller-kind-${kind}`} className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedSellerKinds((prev) => {
                        const next = checked ? prev.filter((k) => k !== kind) : [...prev, kind];
                        return Array.from(new Set(next)) as Array<'particular' | 'companie'>;
                      });
                    }}
                    className="accent-orange-500"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </RoFilterSection>
            </>
          );
          if (!mobileSheetLayout) {
            return (
              <Collapsible defaultOpen={false} className="border-b border-border">
                <CollapsibleTrigger
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-1 py-3 text-left transition-colors ${isDarkMode ? "hover:bg-white/5" : "hover:bg-muted/50"}`}
                >
                  <span className="text-sm font-semibold">Setări avansate</span>
                  <SlidersHorizontal className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0 pt-1">{setariInner}</CollapsibleContent>
              </Collapsible>
            );
          }
          return <div className="space-y-0 border-b border-border pt-1">{setariInner}</div>;
        })()}

        {/* Apartamente – câmpuri în lista principală */}
        {selectedCategory === 'imobiliare' && selectedSubcategory === 'apartamente' && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Număr camere</label>
              <select
                value={detailedFilters.rooms}
                onChange={(e) => setDetailedFilters(prev => ({ ...prev, rooms: e.target.value }))}
                className={`${selectBase} ${selectStyle(!!detailedFilters.rooms)}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
              >
                <option value="">Toate</option>
                <option value="1">1 cameră</option>
                <option value="2">2 camere</option>
                <option value="3">3 camere</option>
                <option value="4">4 camere</option>
                <option value="5+">5+ camere</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.surface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.surface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Etaj</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.floor.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, floor: { ...prev.floor, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.floor.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, floor: { ...prev.floor, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>An construcție</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.buildingYear.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.buildingYear.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
          </>
        )}

        {/* Case și vile – filtre specifice (afișate și când Imobiliare + Toate subcategoriile) */}
        {selectedCategory === 'imobiliare' && (selectedSubcategory === 'case-vile' || selectedSubcategory === 'all') && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Număr camere</label>
              <select
                value={detailedFilters.rooms}
                onChange={(e) => setDetailedFilters(prev => ({ ...prev, rooms: e.target.value }))}
                className={`${selectBase} ${selectStyle(!!detailedFilters.rooms)}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
              >
                <option value="">Toate</option>
                <option value="1">1 cameră</option>
                <option value="2">2 camere</option>
                <option value="3">3 camere</option>
                <option value="4">4 camere</option>
                <option value="5+">5+ camere</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață construită (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.surface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.surface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață teren (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.landSurface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, landSurface: { ...prev.landSurface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.landSurface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, landSurface: { ...prev.landSurface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>An construcție</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.buildingYear.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.buildingYear.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={detailedFilters.garden} onChange={(e) => setDetailedFilters(prev => ({ ...prev, garden: e.target.checked }))} className="rounded border-gray-300" />
                <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Grădină</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={detailedFilters.garage} onChange={(e) => setDetailedFilters(prev => ({ ...prev, garage: e.target.checked }))} className="rounded border-gray-300" />
                <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Garaj</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={detailedFilters.pool} onChange={(e) => setDetailedFilters(prev => ({ ...prev, pool: e.target.checked }))} className="rounded border-gray-300" />
                <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Piscină</span>
              </label>
            </div>
          </>
        )}

        {/* Terenuri intravilane și agricole – filtre specifice */}
        {selectedCategory === 'imobiliare' && (selectedSubcategory === 'terenuri-intravilane' || selectedSubcategory === 'terenuri-agricole') && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.landSurface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, landSurface: { ...prev.landSurface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.landSurface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, landSurface: { ...prev.landSurface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tip teren</label>
              <select
                value={detailedFilters.terrainType}
                onChange={(e) => setDetailedFilters(prev => ({ ...prev, terrainType: e.target.value }))}
                className={`${selectBase} ${selectStyle(!!detailedFilters.terrainType)}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
              >
                <option value="">Toate</option>
                <option value="constructii">Construcții</option>
                <option value="parcela">Parcelă</option>
                <option value="comercial">Comercial</option>
                <option value="industrial">Industrial</option>
                <option value="arabil">Arabil</option>
                <option value="livada">Livadă</option>
                <option value="padure">Pădure</option>
                <option value="pajiste">Pajiște</option>
                <option value="mixt">Mixt</option>
              </select>
            </div>
          </>
        )}

        {/* Spații comerciale și hale industriale – filtre specifice */}
        {selectedCategory === 'imobiliare' && (selectedSubcategory === 'spatii-comerciale' || selectedSubcategory === 'hale-industriale') && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.surface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.surface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>An construcție</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.buildingYear.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.buildingYear.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, buildingYear: { ...prev.buildingYear, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
          </>
        )}

        {/* Proprietăți turistice – filtre specifice */}
        {selectedCategory === 'imobiliare' && selectedSubcategory === 'proprietati-turistice' && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Suprafață (mp)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.surface.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.surface.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, surface: { ...prev.surface, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Număr camere</label>
              <select
                value={detailedFilters.rooms}
                onChange={(e) => setDetailedFilters(prev => ({ ...prev, rooms: e.target.value }))}
                className={`${selectBase} ${selectStyle(!!detailedFilters.rooms)}`}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
              >
                <option value="">Toate</option>
                <option value="1">1 cameră</option>
                <option value="2">2 camere</option>
                <option value="3">3 camere</option>
                <option value="4">4 camere</option>
                <option value="5+">5+ camere</option>
              </select>
            </div>
          </>
        )}

        {/* Vehicule – fără piese-auto (acolo nu au sens an, km, cilindree, combustibil, transmisie) */}
        {['autoturisme', 'suv-4x4', 'motociclete', 'camioane', 'remorci', 'autorulote', 'vehicule-electrice'].includes(selectedSubcategory) && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>An fabricație</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.year.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, year: { ...prev.year, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.year.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, year: { ...prev.year, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kilometraj</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.mileage.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, mileage: { ...prev.mileage, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.mileage.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, mileage: { ...prev.mileage, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Capacitate cilindrică (cm³)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.capacitateCilindrica?.min ?? ''} onChange={(e) => setDetailedFilters(prev => ({ ...prev, capacitateCilindrica: { ...(prev.capacitateCilindrica || { min: '', max: '' }), min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.capacitateCilindrica?.max ?? ''} onChange={(e) => setDetailedFilters(prev => ({ ...prev, capacitateCilindrica: { ...(prev.capacitateCilindrica || { min: '', max: '' }), max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Combustibil</label>
              <select value={detailedFilters.fuelType} onChange={(e) => setDetailedFilters(prev => ({ ...prev, fuelType: e.target.value }))} className={`${selectBase} ${selectStyle(!!detailedFilters.fuelType)}`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}>
                <option value="">Toate</option>
                <option value="Benzină">Benzină</option>
                <option value="Motorină">Motorină</option>
                <option value="GPL">GPL</option>
                <option value="Electric">Electric</option>
                <option value="Hibrid">Hibrid</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Transmisie</label>
              <select value={detailedFilters.transmission} onChange={(e) => setDetailedFilters(prev => ({ ...prev, transmission: e.target.value }))} className={`${selectBase} ${selectStyle(!!detailedFilters.transmission)}`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}>
                <option value="">Toate</option>
                <option value="Manuală">Manuală</option>
                <option value="Automată">Automată</option>
                <option value="Semi-automată">Semi-automată</option>
              </select>
            </div>
          </>
        )}

        {/* Executări silite – câmpuri în lista principală */}
        {(selectedSubcategory === 'exec-imobiliare' || selectedSubcategory === 'exec-autovehicule') && (
          <>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tip executare</label>
              <select value={detailedFilters.executionType} onChange={(e) => setDetailedFilters(prev => ({ ...prev, executionType: e.target.value }))} className={`${selectBase} ${selectStyle(!!detailedFilters.executionType)}`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}>
                <option value="">Toate</option>
                <option value="ANAF">ANAF</option>
                <option value="Judecătorie">Judecătorie</option>
                <option value="Bancă">Bancă</option>
                <option value="Furnizor">Furnizor</option>
                <option value="Alte creanțe">Alte creanțe</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Instanță</label>
              <input type="text" placeholder="Ex: Judecătoria București" value={detailedFilters.court} onChange={(e) => setDetailedFilters(prev => ({ ...prev, court: e.target.value }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Debitor</label>
              <input type="text" placeholder="Nume debitor" value={detailedFilters.debtor} onChange={(e) => setDetailedFilters(prev => ({ ...prev, debtor: e.target.value }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
            </div>
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Valoare executare (Lei)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={detailedFilters.executionValue.min} onChange={(e) => setDetailedFilters(prev => ({ ...prev, executionValue: { ...prev.executionValue, min: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
                <input type="number" placeholder="Max" value={detailedFilters.executionValue.max} onChange={(e) => setDetailedFilters(prev => ({ ...prev, executionValue: { ...prev.executionValue, max: e.target.value } }))} className={`w-full px-3 py-2.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 ${inputStyle}`} />
              </div>
            </div>
          </>
        )}

        {/* Timp rămas – doar pentru Executări Silite */}
        {String(selectedCategory) === 'executari' && (
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Timp rămas
            </label>
            <select
              value={timeRemainingFilter}
              onChange={(e) => setTimeRemainingFilter(e.target.value)}
              className={`${selectBase} ${selectStyle(!!timeRemainingFilter)}`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
            >
              <option value="">Toate</option>
              <option value="24h">Expiră în 24 ore</option>
              <option value="48h">Expiră în 48 ore</option>
              <option value="1week">Expiră în 1 săptămână</option>
              <option value="2weeks">Expiră în 2 săptămâni</option>
            </select>
          </div>
        )}
            </>
          );
          if (mobileSheetLayout) {
            // Fără al doilea rând „Filtrări avansate” în listă — deschiderea e doar din footer (mobileAdvancedOpen)
            return (
              <div className="space-y-0 border-b border-border pb-1">
                {!skipCategories ? renderExecutariCategoryExtras() : null}
                {advancedFiltersInner}
              </div>
            );
          }
          return advancedFiltersInner;
        })()}

        {/* Action Buttons */}
        {!mobileSheetLayout ? (
        <div className={`mt-4 space-y-2 border-t pt-4 ${isDarkMode ? 'border-border' : 'border-border'}`}>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              clearFilters();
              if (window.innerWidth < 1024) {
                setShowFilters(false);
              }
            }}
          >
            Șterge filtrele
          </Button>
          <Button
            type="button"
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => {
              saveFilters();
              if (window.innerWidth < 1024) {
                setShowFilters(false);
              }
            }}
          >
            Salvează filtre
          </Button>

          {hasSavedFilters && (
            <Button
              type="button"
              variant="outline"
              className={`w-full ${isDarkMode ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-600/50 text-emerald-700 hover:bg-emerald-50'}`}
              onClick={() => {
                loadSavedFilters();
                if (window.innerWidth < 1024) {
                  setShowFilters(false);
                }
              }}
            >
              <i className="ri-folder-open-line mr-2" aria-hidden />
              Încarcă filtrele salvate
            </Button>
          )}
        </div>
        ) : null}
      </div>
    );
  };

  // Load user info and tokens from localStorage
  useEffect(() => {
    const savedUserInfo = localStorage.getItem('userInfo');
    const savedTokens = localStorage.getItem('userTokens');

    // Banner dezactivat – nu afișăm popup-ul „Anunțurile de Licitații”
    setShowBanner(false);

    // Load saved filters
    loadSavedFilters();

    const savedUnlocked = localStorage.getItem('unlockedAuctions');
    const savedFavorites = localStorage.getItem('favoriteAuctions');
    const savedNotifications = localStorage.getItem('auctionNotifications');
    const savedFavoritesTimestamp = localStorage.getItem('favoriteAuctionsTimestamp');

    // Verifică dacă favoritele guest au expirat (12 ore = 43200000 ms)
    if (savedFavorites && savedFavoritesTimestamp && typeof window !== 'undefined') {
      const timestamp = parseInt(savedFavoritesTimestamp, 10);
      const now = Date.now();
      const twelveHours = 12 * 60 * 60 * 1000; // 12 ore în milisecunde

      // Verifică dacă există sesiune Supabase
      supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
        const session = data.session;
        // Dacă nu e logat și au trecut 12 ore, șterge favoritele
        if (!session && (now - timestamp) > twelveHours) {
          console.log('[Auctions] Guest favorites expired (12h), clearing...');
          localStorage.removeItem('favoriteAuctions');
          localStorage.removeItem('favoriteAuctionsTimestamp');
          setFavoriteAuctions([]);
          notifyGuestFavoritesUpdated();
        }
      }).catch((err: unknown) => {
        console.warn('Error checking session for favorites expiration:', err);
      });
    }

    // Încarcă userInfo dacă există, dar nu bloca accesul dacă nu există
    // Pagina /ro (Licitatii) este publică și accesibilă fără autentificare
    if (savedUserInfo) {
      try {
        const parsedInfo = JSON.parse(savedUserInfo);
        setUserInfo(prev => ({ ...prev, ...parsedInfo }));
      } catch (e) {
        console.warn('Error parsing userInfo from localStorage:', e);
      }
    } else {
      // Verifică dacă există sesiune Supabase
      supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
        const session = data.session;
        if (session?.user) {
          // Dacă există sesiune Supabase, încarcă informațiile utilizatorului
          setUserInfo(prev => ({
            ...prev,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email || '',
            picture: session.user.user_metadata?.picture || session.user.user_metadata?.avatar_url || ''
          }));
        }
      }).catch((err: unknown) => {
        console.warn('Error checking Supabase session:', err);
      });
    }

    // Load tokens from Supabase first
    const loadTokensFromSupabase = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const accessToken = session.access_token;
          const tokensResponse = await fetch('/api/tokens', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (tokensResponse.ok) {
            const tokensData = await tokensResponse.json();

            // Dacă nu există record în Supabase și există tokeni în localStorage, migrează-i
            if (tokensData.balance === 0 && tokensData.totalEarned === 0 && tokensData.totalSpent === 0) {
              const savedTokens = localStorage.getItem('userTokens');
              if (savedTokens) {
                try {
                  const localTokens = JSON.parse(savedTokens);
                  if (localTokens.balance > 0 || localTokens.totalSpent > 0) {
                    console.log('[Auctions] Migrating tokens from localStorage to Supabase...');
                    const migrateResponse = await fetch('/api/tokens', {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        balance: localTokens.balance || 0,
                        totalEarned: localTokens.totalEarned || 0,
                        totalSpent: localTokens.totalSpent || 0,
                        level: localTokens.level || 'Basic',
                        package: localTokens.package || 'Basic'
                      })
                    });

                    if (migrateResponse.ok) {
                      const migratedData = await migrateResponse.json();
                      setUserTokens({
                        balance: migratedData.balance ?? 0,
                        totalEarned: migratedData.totalEarned ?? 0,
                        totalSpent: migratedData.totalSpent ?? 0,
                        level: migratedData.level || 'Basic',
                        package: migratedData.package || 'Basic'
                      });
                      localStorage.setItem('userTokens', JSON.stringify({
                        balance: migratedData.balance ?? 0,
                        totalEarned: migratedData.totalEarned ?? 0,
                        totalSpent: migratedData.totalSpent ?? 0,
                        level: migratedData.level || 'Basic',
                        package: migratedData.package || 'Basic'
                      }));
                      return;
                    }
                  }
                } catch (e) {
                  console.error('[Auctions] Error migrating tokens:', e);
                }
              }
            }

            setUserTokens({
              balance: tokensData.balance ?? 0,
              totalEarned: tokensData.totalEarned ?? 0,
              totalSpent: tokensData.totalSpent ?? 0,
              level: tokensData.level || 'Basic',
              package: tokensData.package || 'Basic'
            });
            return;
          }
        }
      } catch (error) {
        console.error('Error loading tokens from Supabase:', error);
      }

      // Fallback to localStorage only if no Supabase session
      if (savedTokens) {
        const tokens = JSON.parse(savedTokens);
        setUserTokens(tokens);
      } else {
        // NO default tokens - must be 0 if no record exists
        setUserTokens({
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: 'Basic',
          package: 'Basic'
        });
      }
    };

    loadTokensFromSupabase();

    // Load from Supabase if session exists
    const loadFromSupabase = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Fallback to localStorage
          if (savedUnlocked) {
            setUnlockedAuctions(JSON.parse(savedUnlocked));
          }
          if (savedFavorites) {
            // Verifică dacă favoritele guest au expirat (12 ore)
            const savedFavoritesTimestamp = localStorage.getItem('favoriteAuctionsTimestamp');
            if (savedFavoritesTimestamp) {
              const timestamp = parseInt(savedFavoritesTimestamp, 10);
              const now = Date.now();
              const twelveHours = 12 * 60 * 60 * 1000; // 12 ore

              if ((now - timestamp) <= twelveHours) {
                // Favoritele sunt încă valide
                setFavoriteAuctions(JSON.parse(savedFavorites));
                notifyGuestFavoritesUpdated();
              } else {
                // Favoritele au expirat, șterge-le
                console.log('[Auctions] Guest favorites expired, clearing...');
                localStorage.removeItem('favoriteAuctions');
                localStorage.removeItem('favoriteAuctionsTimestamp');
                setFavoriteAuctions([]);
                notifyGuestFavoritesUpdated();
              }
            } else {
              // Nu există timestamp, încarcă favoritele (pentru backward compatibility)
              setFavoriteAuctions(JSON.parse(savedFavorites));
              // Setează timestamp pentru viitoarele verificări
              localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
              notifyGuestFavoritesUpdated();
            }
          }
          if (savedNotifications) {
            setAuctionNotifications(JSON.parse(savedNotifications));
          }
          return;
        }

        const accessToken = session.access_token;

        // Load unlocked auctions
        const unlockedResponse = await fetch('/api/user/unlocked-auctions', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (unlockedResponse.ok) {
          const unlockedData = await unlockedResponse.json();
          setUnlockedAuctions(unlockedData || []);
        }

        // Load favorites
        const favoritesResponse = await fetch('/api/user/favorites', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (favoritesResponse.ok) {
          const favoritesData = await favoritesResponse.json();
          const favorites = favoritesData.favorites || [];
          const auctionIds = favorites.filter((f: any) => f.item_type === 'auction').map((f: any) => f.item_id);
          setFavoriteAuctions(auctionIds);
        }

        // Load notifications
        const notificationsResponse = await fetch('/api/user/auction-notifications', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (notificationsResponse.ok) {
          const notificationsData = await notificationsResponse.json();
          setAuctionNotifications(notificationsData || {});
        }
      } catch (error) {
        console.error('Error loading from Supabase:', error);
        // Fallback to localStorage
        if (savedUnlocked) {
          setUnlockedAuctions(JSON.parse(savedUnlocked));
        }
        if (savedFavorites) {
          setFavoriteAuctions(JSON.parse(savedFavorites));
          notifyGuestFavoritesUpdated();
        }
        if (savedNotifications) {
          setAuctionNotifications(JSON.parse(savedNotifications));
        }
      }
    };

    loadFromSupabase();
  }, []);


  // Listen for storage changes to sync unlocked auctions
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUnlocked = localStorage.getItem('unlockedAuctions');
      if (savedUnlocked) {
        setUnlockedAuctions(JSON.parse(savedUnlocked));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleUnlockAuction = async (auctionId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
    const userId = session?.user?.id || savedSupabaseUserId;

    if (!userId || !session?.access_token) {
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/ro';
      const loginUrl = currentUrl ? `/auth?mode=login&redirect=${encodeURIComponent(currentUrl)}` : '/auth?mode=login';
      router.push(loginUrl);
      return;
    }

    if (userTokens.balance < 1) {
      setMessage({ type: 'error', text: 'Nu ai suficienți tokens! Soldul tău: ' + userTokens.balance + ' tokens' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    try {

      const newBalance = userTokens.balance - 1;
      const newTotalSpent = userTokens.totalSpent + 1;

      // Update tokens in Supabase
      const tokensResponse = await fetch('/api/tokens', {
        method: 'PUT',
        headers: {
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          balance: newBalance,
          totalEarned: userTokens.totalEarned,
          totalSpent: newTotalSpent,
          level: userTokens.level,
          package: userTokens.package
        })
      });

      if (!tokensResponse.ok) {
        throw new Error('Failed to update tokens');
      }

      // Add unlocked auction to Supabase
      const unlockedResponse = await fetch('/api/user/unlocked-auctions', {
        method: 'POST',
        headers: {
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId
        })
      });

      if (!unlockedResponse.ok) {
        throw new Error('Failed to save unlocked auction');
      }

      // Update local state
      const updatedTokens = {
        ...userTokens,
        balance: newBalance,
        totalSpent: newTotalSpent
      };
      setUserTokens(updatedTokens);
      localStorage.setItem('userTokens', JSON.stringify(updatedTokens));

      const newUnlocked = [...unlockedAuctions, auctionId];
      setUnlockedAuctions(newUnlocked);
      localStorage.setItem('unlockedAuctions', JSON.stringify(newUnlocked));

      setMessage({ type: 'success', text: 'Anunțul a fost deblocat cu succes! Ai cheltuit 1 token.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error unlocking auction:', error);
      setMessage({ type: 'error', text: 'Eroare la deblocarea anunțului. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const isLicitatiiPublice = (auction: { saleType?: string; productType?: string }) => {
    return auction.saleType === 'licitatie-publica' || auction.productType === 'licitatii-publice';
  };

  /** Categoria „Executări și Insolvență” – la aceasta nu mutăm cronometrul în poză. */
  const isExecutariInsolventa = (auction: { category?: string; main_category?: string }) => {
    const c = (auction.category || '').toString().toLowerCase();
    const m = (auction.main_category || '').toString();
    return c === 'executari' || c.includes('executări') || c.includes('insolvent') || m === 'Executări și Insolvență' || m.toLowerCase().includes('executari');
  };

  const isConditionNew = (condition: string | undefined) => {
    if (!condition) return false;
    const c = String(condition).trim().toLowerCase();
    return c === 'nou' || c === 'nouă';
  };

  /** Fallback unic pentru lipsă locație (convertProductToAuction trebuie să folosească același text). */
  const LOCATION_FALLBACK_LABEL = 'Locație neprecizată';

  /** „Locatie/Locație neprecizată” nu e adresă — altfel getDisplayCity extrage greșit „neprecizată”. */
  const isUnknownLocationPlaceholder = (raw: string | undefined): boolean => {
    const n = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return (
      n === 'locație neprecizată' ||
      n === 'locatie neprecizată' ||
      n === 'locatie neprecizata'
    );
  };

  const getDisplayCity = (location: string | undefined): string => {
    if (!location || !String(location).trim()) return '';
    const s = String(location).trim();
    if (isUnknownLocationPlaceholder(s)) return '';
    const locMatch = s.match(/loc\.\s*([^,]+)/i);
    if (locMatch) return locMatch[1].trim();
    const judMatch = s.match(/jud\.\s*([^,]+)/i);
    if (judMatch) return judMatch[1].trim();
    const first = s.split(',')[0].trim();
    const parts = first.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last && last.length <= 25) return last;
    return first.length <= 30 ? first : s;
  };

  /** Afișează orașul sau județul pe carduri – prioritate: city > county > location parsée */
  const getLocationDisplay = (auction: { city?: string; county?: string; location?: string }): string => {
    const cityRaw = (auction.city ?? '').toString().trim();
    const countyRaw = (auction.county ?? '').toString().trim();
    const locRaw = (auction.location ?? '').toString().trim();
    const city = isUnknownLocationPlaceholder(cityRaw) ? '' : cityRaw;
    const county = isUnknownLocationPlaceholder(countyRaw) ? '' : countyRaw;
    const loc = isUnknownLocationPlaceholder(locRaw) ? '' : locRaw;
    if (city) return city;
    if (county) return county;
    const parsed = getDisplayCity(loc);
    if (parsed) return parsed;
    return loc || LOCATION_FALLBACK_LABEL;
  };

  const getLocationDisplayWithDistance = (auction: {
    id?: string | number;
    slug?: string;
    city?: string;
    county?: string;
    location?: string;
    coordinates?: unknown;
    custom_fields?: Record<string, unknown> | null;
  }): string => {
    const baseLocation = getLocationDisplay(auction);
    const cacheKey = String(auction.id ?? auction.slug ?? '');
    const distanceKm = getAuctionDistanceKm(
      {
        coordinates: auction.coordinates ?? (cacheKey ? resolvedListingCoordinates[cacheKey] : undefined),
        custom_fields: auction.custom_fields,
      },
      { lat: nearLat, lng: nearLng },
    );
    const distanceLabel = distanceKm != null ? formatDistanceKmLabel(distanceKm) : '';
    if (!distanceLabel && nearLat != null && nearLng != null) return `${baseLocation} • calculez distanța...`;
    return distanceLabel ? `${baseLocation} • ${distanceLabel}` : baseLocation;
  };

  const getCompactLocationWithDistance = (auction: {
    id?: string | number;
    slug?: string;
    city?: string;
    county?: string;
    location?: string;
    coordinates?: unknown;
    custom_fields?: Record<string, unknown> | null;
  }): string => {
    const city = String(auction.city ?? '').trim();
    const county = String(auction.county ?? '').trim();
    const locationName = city && county ? `${city}, ${county}` : getLocationDisplay(auction);
    const cacheKey = String(auction.id ?? auction.slug ?? '');
    const distanceKm = getAuctionDistanceKm(
      {
        coordinates: auction.coordinates ?? (cacheKey ? resolvedListingCoordinates[cacheKey] : undefined),
        custom_fields: auction.custom_fields,
      },
      { lat: nearLat, lng: nearLng },
    );
    const distanceLabel = distanceKm != null ? formatDistanceKmLabel(distanceKm) : '';
    if (!distanceLabel && nearLat != null && nearLng != null) return `calculez distanța... (${locationName})`;
    return distanceLabel ? `${distanceLabel} (${locationName})` : locationName;
  };

  useEffect(() => {
    if (nearLat == null || nearLng == null || !Number.isFinite(nearLat) || !Number.isFinite(nearLng)) return;
    const uniqueById = new Map<string, any>();
    for (const auction of [...displayedAuctions, ...combinedAuctions]) {
      const key = String((auction as any)?.id ?? (auction as any)?.slug ?? '');
      if (key && !uniqueById.has(key)) uniqueById.set(key, auction);
    }

    /** Un singur fetch per oraș+județ (cheie dedupe); toate licitațiile cu aceeași locație primesc aceleași coordonate. */
    const byDedupe = new Map<string, { query: string; keys: string[] }>();
    for (const auction of uniqueById.values()) {
      const key = String(auction?.id ?? auction?.slug ?? '');
      if (!key || resolvedListingCoordinates[key]) continue;
      if (parseCoordinatesJson(auction?.coordinates) || parseCoordinatesJson(auction?.custom_fields?.coordinates)) continue;
      const label = getLocationDisplay(auction);
      if (!label || label === LOCATION_FALLBACK_LABEL) continue;
      const rawQuery =
        [auction?.city, auction?.county].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ') ||
        getLocationDisplay(auction);
      const query = stripMetropolitanZoneFromLocationQuery(rawQuery);
      if (!query) continue;
      const dedupe = normalizeLocationQueryDedupeKey(query);
      if (locationResolveFailedQueriesRef.current.has(dedupe)) continue;

      let g = byDedupe.get(dedupe);
      if (!g) {
        if (byDedupe.size >= MAX_UNIQUE_LOCATION_QUERIES_PER_COORD_BATCH) continue;
        g = { query, keys: [] };
        byDedupe.set(dedupe, g);
      }
      g.keys.push(key);
    }

    if (byDedupe.size === 0) return;
    let cancelled = false;
    const runId = ++listingCoordResolveRunRef.current;
    const batches = Array.from(byDedupe.entries());

    void (async () => {
      const flatEntries: Array<readonly [string, { lat: number; lng: number }]> = [];

      await Promise.all(
        batches.map(([dedupe, { query, keys }]) =>
          listingDistanceCoordResolveLimit(async () => {
            try {
              const res = await fetch(`/api/ro/resolve-location?q=${encodeURIComponent(query)}`);
              const data = await res.json();
              if (
                res.ok &&
                data?.ok &&
                typeof data.lat === 'number' &&
                typeof data.lng === 'number' &&
                Number.isFinite(data.lat) &&
                Number.isFinite(data.lng)
              ) {
                const coords = { lat: data.lat, lng: data.lng };
                for (const key of keys) flatEntries.push([key, coords] as const);
              } else {
                locationResolveFailedQueriesRef.current.add(dedupe);
              }
            } catch {
              locationResolveFailedQueriesRef.current.add(dedupe);
            }
          }),
        ),
      );

      if (cancelled || runId !== listingCoordResolveRunRef.current) return;
      if (flatEntries.length === 0) return;
      setResolvedListingCoordinates((prev) => {
        const next = { ...prev };
        for (const [key, coords] of flatEntries) next[key] = coords;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [combinedAuctions, displayedAuctions, nearLat, nearLng, resolvedListingCoordinates]);

  const isAuctionUnlocked = (auction: { id: string; saleType?: string; productType?: string }) => {
    if (!isLicitatiiPublice(auction)) return true;
    return unlockedAuctions.includes(auction.id);
  };

  const isAuctionFavorite = (auctionId: string) => {
    return favoriteAuctions.includes(auctionId);
  };

  const handleToggleFavorite = async (auctionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const isFavorite = isAuctionFavorite(auctionId);

      if (isFavorite) {
        // Remove favorite
        if (session) {
          // Remove from Supabase if logged in
          const accessToken = session.access_token;
          const response = await fetch(`/api/user/favorites?itemId=${auctionId}&itemType=auction`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const newFavorites = favoriteAuctions.filter(id => id !== auctionId);
            setFavoriteAuctions(newFavorites);
            localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
            notifyGuestFavoritesUpdated();
            setFavoriteNotification({ show: true, message: 'Anunțul a fost eliminat din favorite!', isRemoved: true });
            setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
          } else {
            throw new Error('Failed to remove favorite');
          }
        } else {
          // Remove from localStorage only (guest user)
          const newFavorites = favoriteAuctions.filter(id => id !== auctionId);
          setFavoriteAuctions(newFavorites);
          localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
          // Update timestamp
          localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
          notifyGuestFavoritesUpdated();
          setFavoriteNotification({ show: true, message: 'Anunțul a fost eliminat din favorite!', isRemoved: true });
          setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
        }
      } else {
        // Add favorite
        const auction = auctions.find(a => a.id === auctionId);
        if (auction) {
          const { data: { session } } = await supabase.auth.getSession();

          if (session) {
            // User is logged in - check if lists exist
            const favoritesResponse = await fetch('/api/user/favorites', {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            });

            if (favoritesResponse.ok) {
              const favoritesData = await favoritesResponse.json();
              const listsData = favoritesData.favoriteLists || [];

              // If no lists exist, create "LISTA 1" and save directly
              if (listsData.length === 0) {
                const userId = session.user.id;
                const lista1Id = `lista-1-${userId}`;

                // Create "LISTA 1"
                const createListResponse = await fetch('/api/user/favorite-lists', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    id: lista1Id,
                    name: 'LISTA 1'
                  })
                });

                if (createListResponse.ok) {
                  const newList = await createListResponse.json();

                  // Save favorite directly to "LISTA 1"
                  const addResponse = await fetch('/api/user/favorites', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      itemId: auctionId,
                      itemType: 'auction',
                      favoriteListId: newList.id
                    })
                  });

                  if (addResponse.ok) {
                    const newFavorites = [...favoriteAuctions, auctionId];
                    setFavoriteAuctions(newFavorites);
                    localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
                    notifyGuestFavoritesUpdated();
                    setFavoriteNotification({ show: true, message: 'Anunțul a fost adăugat la favorite!', isRemoved: false });
                    setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
                    return;
                  }
                }
              } else if (listsData.length === 1) {
                // Only one list exists - save directly without modal
                const addResponse = await fetch('/api/user/favorites', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    itemId: auctionId,
                    itemType: 'auction',
                    favoriteListId: listsData[0].id
                  })
                });

                if (addResponse.ok) {
                  const newFavorites = [...favoriteAuctions, auctionId];
                  setFavoriteAuctions(newFavorites);
                  localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
                  notifyGuestFavoritesUpdated();
                  setFavoriteNotification({ show: true, message: 'Anunțul a fost adăugat la favorite!', isRemoved: false });
                  setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
                  return;
                }
              } else {
                // Multiple lists exist - show modal to select lists
                setSelectedProductForFavorite({
                  id: auctionId,
                  title: auction.title || 'Produs'
                });
                setShowFavoriteModal(true);
              }
            }
          } else {
            // Guest user - add to localStorage only
            const newFavorites = [...favoriteAuctions, auctionId];
            setFavoriteAuctions(newFavorites);
            localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
            localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
            notifyGuestFavoritesUpdated();
            setFavoriteNotification({ show: true, message: 'Anunțul a fost adăugat la favorite!', isRemoved: false });
            setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
          }
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleFavoriteModalSuccess = () => {
    // Reload favorites after modal success
    const loadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const accessToken = session.access_token;
          const response = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            const favorites = data.favorites || [];
            const favoriteIds = favorites.map((f: any) => f.item_id);
            setFavoriteAuctions(favoriteIds);
            localStorage.setItem('favoriteAuctions', JSON.stringify(favoriteIds));
            notifyGuestFavoritesUpdated();
          }
        }
      } catch (error) {
        console.error('Error reloading favorites:', error);
      }
    };
    loadFavorites();
    setFavoriteNotification({ show: true, message: 'Anunțul a fost adăugat la favorite!', isRemoved: false });
    setTimeout(() => setFavoriteNotification({ show: false, message: '', isRemoved: false }), 2000);
  };

  // Old code for direct add (kept for reference but not used)
  const handleAddFavoriteDirect = async (auctionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Add to Supabase if logged in
        const accessToken = session.access_token;
        const response = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: auctionId,
            itemType: 'auction',
            favoriteListId: 'default-list'
          })
        });

        if (response.ok) {
          const newFavorites = [...favoriteAuctions, auctionId];
          setFavoriteAuctions(newFavorites);
          localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
          notifyGuestFavoritesUpdated();
          setMessage({ type: 'success', text: 'Anunțul a fost adăugat la favorite!' });
        } else {
          throw new Error('Failed to add favorite');
        }
      } else {
        // Add to localStorage only (guest user) - with timestamp for 12h expiration
        const newFavorites = [...favoriteAuctions, auctionId];
        setFavoriteAuctions(newFavorites);
        localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
        // Save timestamp for expiration check (12 hours = 43200000 ms)
        localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
        notifyGuestFavoritesUpdated();
        setMessage({
          type: 'success',
          text: 'Anunțul a fost adăugat la favorite! Te rugăm să te autentifici în următoarele 12 ore pentru a le salva permanent.'
        });
      }

      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error adding favorite:', error);
      setMessage({ type: 'error', text: 'Eroare la actualizarea favorite-ului. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleToggleNotification = async (auctionId: string, timeBefore: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShowAuthModal(true);
        return;
      }

      const isEnabled = !auctionNotifications[auctionId]?.enabled;
      const accessToken = session.access_token;

      // Update in Supabase
      const response = await fetch('/api/user/auction-notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId,
          enabled: isEnabled,
          timeBefore: timeBefore || null
        })
      });

      if (response.ok) {
        const newNotifications = {
          ...auctionNotifications,
          [auctionId]: {
            enabled: isEnabled,
            timeBefore: timeBefore
          }
        };

        setAuctionNotifications(newNotifications);
        localStorage.setItem('auctionNotifications', JSON.stringify(newNotifications));

        // Add to centralized notification system
        const auction = auctions.find(a => a.id === auctionId);
        const message = isEnabled
          ? `🔔 Notificare activată pentru "${auction?.title}"`
          : `🔕 Notificare dezactivată pentru "${auction?.title}"`;

        // Add to localStorage notifications
        const existingNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
        const newNotification = {
          id: Date.now().toString(),
          message,
          type: isEnabled ? 'success' : 'info',
          timestamp: new Date().toISOString(),
          read: false
        };
        const updatedNotifications = [newNotification, ...existingNotifications];
        localStorage.setItem('notifications', JSON.stringify(updatedNotifications));

        // Show popup notification
        setNotificationPopup({ show: true, message });

        // Auto hide after 2 seconds
        setTimeout(() => {
          setNotificationPopup({ show: false, message: '' });
        }, 2000);
      } else {
        throw new Error('Failed to update notification');
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      setMessage({ type: 'error', text: 'Eroare la actualizarea notificării. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    localStorage.removeItem('userTokens');
    localStorage.removeItem('unlockedAuctions');
    window.location.href = '/';
  };

  return (
    <div className={`flex flex-col min-h-screen transition-all duration-300 ${isDarkMode
      ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700'
      : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
      }`}>
      {/* Page loading overlay (non-list) */}

      {/* Notification Popup */}
      {notificationPopup.show && (
        <div className="fixed top-[max(5rem,calc(env(safe-area-inset-top,0px)+3.25rem))] right-[max(1rem,env(safe-area-inset-right,0px))] z-50 animate-in slide-in-from-right-5 duration-300 max-w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-2rem)]">
          <div className={`backdrop-blur-lg rounded-xl px-4 py-3 shadow-2xl border max-w-sm ${isDarkMode
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-300'
            }`}>
            <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>{notificationPopup.message}</p>
          </div>
        </div>
      )}

      {/* Favorite Notification - Transparent */}
      {favoriteNotification.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-padding pointer-events-none animate-in fade-in zoom-in-95 duration-300">
          <div
            className={`pointer-events-auto backdrop-blur-xl rounded-2xl px-6 py-4 shadow-2xl border flex items-center gap-3 max-w-[min(100%,calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-2rem))] ${isDarkMode
              ? 'bg-white/15 border-white/20'
              : 'bg-white/70 border-white/50'
              }`}
          >
            <div className="flex-shrink-0">
              {favoriteNotification.isRemoved ? (
                <CloseIcon
                  size="m"
                  className="text-red-500"
                  strokeWidth={2.5}
                />
              ) : (
                <HeartIcon
                  size="m"
                  className="text-red-500 fill-red-500"
                  strokeWidth={2}
                />
              )}
            </div>
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>{favoriteNotification.message}</p>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-area-padding"
          onClick={() => setShowAuthModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Content */}
          <div
            className={`relative w-full max-w-md rounded-2xl shadow-2xl border transform transition-all ${isDarkMode
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-200'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${isDarkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
            >
              <i className="ri-close-line text-xl"></i>
            </button>

            {/* Modal Body */}
            <div className="p-6 md:p-8">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDarkMode
                  ? 'bg-red-500/20'
                  : 'bg-red-100'
                  }`}>
                  <i className="ri-lock-line text-3xl text-red-500"></i>
                </div>
              </div>

              {/* Title */}
              <h3 className={`text-xl md:text-2xl font-bold text-center mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                Autentificare necesară
              </h3>

              {/* Message */}
              <p className={`text-sm md:text-base text-center mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                Trebuie să fii autentificat pentru a accesa această funcționalitate.
              </p>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowAuthModal(false)}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${isDarkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Anulează
                </button>
                <button
                  onClick={() => {
                    setShowAuthModal(false);
                    window.location.href = '/auth?mode=login';
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl"
                >
                  Autentifică-te
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Universal Header */}
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Mobile Menu – doar panou lateral, fără overlay; pagina rămâne 100% utilizabilă */}
      {isMobileMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className={`md:hidden fixed top-0 left-0 z-[99999] w-80 max-h-[100dvh] overflow-y-auto shadow-xl border-r border-gray-200 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-600">
              <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Meniu</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <span className={`text-xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>×</span>
                </div>
              </button>
            </div>

            {/* Dark Mode Toggle - Top */}
            <div className="p-4 border-b border-gray-600">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
              >
                <span className="flex items-center space-x-2">
                  <span className="text-lg">{isDarkMode ? '🌙' : '☀️'}</span>
                  <span>Mod întunecat</span>
                </span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {isDarkMode ? 'Activat' : 'Dezactivat'}
                </span>
              </button>
            </div>

            {/* Filtre mai precise – deschide modalul complet de filtre */}
            <div className="px-4 pt-2 pb-4 border-b border-gray-600">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setFilterModalMode('precise');
                  setShowFilters(true);
                }}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <span className="text-lg">🔍</span>
                <span>Filtre mai precise</span>
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 p-4 space-y-2">
              <a
                href="/"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">🏠</span>
                <span>Homepage</span>
              </a>

              <a
                href="/ro"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">🔨</span>
                <span>Licitații</span>
              </a>

              <a
                href="/dashboard"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">📊</span>
                <span>Dashboard</span>
              </a>

              <a
                href="/favorites"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">❤️</span>
                <span>Favorite</span>
              </a>

              <a
                href="/dashboard/settings"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">⚙️</span>
                <span>Setări</span>
              </a>

              <a
                href="/dashboard/tokens"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">💰</span>
                <span>Token-uri</span>
              </a>

              <a
                href="/dashboard/payments"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">💳</span>
                <span>Plăți</span>
              </a>

              <a
                href="/dashboard/support"
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-100'
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="text-lg">🎫</span>
                <span>Suport</span>
              </a>
            </div>

            {/* Logout Button - Bottom */}
            <div className="p-4 border-t border-gray-600">
              <button
                onClick={() => {
                  handleLogout();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-center space-x-2 p-3 rounded-lg transition-colors ${isDarkMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-100 text-red-600 hover:bg-red-200'
                  }`}
              >
                <span className="text-lg">🚪</span>
                <span>Ieșire</span>
              </button>
            </div>
          </div>
        </div>
        , document.body)}

      {/* Main Content – flex-1 pentru a împinge footer-ul jos */}
      <div className="flex-1 flex flex-col">
        <div className="max-w-7xl mx-auto w-full flex-1 px-4 pb-8 pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:py-8">
          {/* Message */}
          {message.text && (
            <div className={`mb-6 p-4 rounded-lg ${message.type === 'success'
              ? isDarkMode
                ? 'bg-green-500/20 text-green-200 border border-green-500/30'
                : 'bg-green-100 text-green-800 border border-green-200'
              : isDarkMode
                ? 'bg-red-500/20 text-red-200 border border-red-500/30'
                : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
              {message.text}
            </div>
          )}

          {/* Bara marketplace mobilă (sticky): Filtre/Lei/Sort deasupra, căutare dedesubt */}
          <div
            className={cn(
              "sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 lg:hidden",
              "mb-3 sm:mb-6",
            )}
          >
              {/* Mobil: Filtre + Lei|EUR + Sortare — primul rând */}
              <div className="mx-auto w-full max-w-7xl border-b border-border/70 px-3 pb-2 pt-1.5 sm:px-6 sm:pb-3 sm:pt-2">
                <div className="grid w-full min-w-0 grid-cols-3 items-center gap-1.5 min-h-[2.5rem] sm:min-h-[2.75rem] sm:gap-2">
                  <div className="flex min-w-0 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex h-9 max-w-full shrink-0 items-center gap-1 px-1.5 sm:h-10 sm:gap-2 sm:px-2.5"
                      onClick={() => {
                        setFilterModalMode("precise");
                        setShowFilters(true);
                      }}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" aria-hidden />
                      <span className="whitespace-nowrap text-[11px] font-medium sm:text-sm">Filtre</span>
                      {/* Slot fix pentru badge — aceleași dimensiuni cu/fără număr (evită salt la layout) */}
                      <span
                        className={cn(
                          "ml-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white sm:h-5 sm:min-w-5 sm:text-xs",
                          marketplaceToolbarFilterCount > 0 ? "bg-neutral-950" : "invisible pointer-events-none",
                        )}
                        aria-hidden={marketplaceToolbarFilterCount === 0}
                      >
                        {marketplaceToolbarFilterCount > 0 ? marketplaceToolbarFilterCount : "\u00a0"}
                      </span>
                    </Button>
                  </div>

                  <div className="flex min-w-0 justify-center">
                    <div
                      className={`flex w-full min-w-0 rounded-lg sm:rounded-xl p-0.5 sm:p-1 transition-colors ${isDarkMode ? "bg-gray-700" : "border border-gray-200 bg-white shadow-sm"}`}
                      role="tablist"
                      aria-label="Monedă afișare"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedCurrency === "RON"}
                        onClick={() => setSelectedCurrency("RON")}
                        className={`relative flex-1 min-w-0 whitespace-nowrap px-1 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-medium rounded-md sm:rounded-lg transition-all duration-200 ${selectedCurrency === "RON" ? (isDarkMode ? "bg-white text-gray-900 shadow-md" : "bg-slate-900 text-white shadow-sm") : isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}
                      >
                        Lei
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedCurrency === "EUR"}
                        onClick={() => setSelectedCurrency("EUR")}
                        className={`relative flex-1 min-w-0 whitespace-nowrap px-1 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-sm font-medium rounded-md sm:rounded-lg transition-all duration-200 ${selectedCurrency === "EUR" ? (isDarkMode ? "bg-white text-gray-900 shadow-md" : "bg-slate-900 text-white shadow-sm") : isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}
                      >
                        EUR
                      </button>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center justify-center gap-0.5 sm:gap-1">
                    <span
                      className={`hidden min-[380px]:flex shrink-0 items-center ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      aria-hidden
                    >
                      <i className="ri-sort-asc text-orange-500 text-sm sm:text-base" />
                    </span>
                    <div className="min-w-0 w-full">
                      <RoSortSelect
                        value={sortBy}
                        onValueChange={setSortBy}
                        options={RO_SORT_OPTIONS}
                        isDarkMode={isDarkMode}
                        size="compact"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Al doilea rând: căutare */}
              <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 sm:py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 sm:gap-2">
                    {selectedCategory !== "all" && showSearchFinBrandChip && searchFinBrandChipDisplay ? (
                      <span
                        className={`inline-flex max-w-[38vw] min-w-0 shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-xs font-normal sm:max-w-[min(100%,14rem)] sm:rounded-xl sm:px-2 sm:py-1.5 sm:text-sm ${isDarkMode ? "border-gray-600 bg-gray-800/90 text-gray-200" : "border-gray-200 bg-white text-gray-800"}`}
                      >
                        <span className="min-w-0 truncate font-normal">{searchFinBrandChipDisplay}</span>
                        <button
                          type="button"
                          onClick={clearSearchFinBrandChip}
                          className="shrink-0 rounded p-0.5 text-red-600 transition-colors hover:bg-red-500/15 hover:text-red-700"
                          aria-label="Elimină marca (filtru Marca și căutare)"
                          title="Elimină marca"
                        >
                          <span className="text-lg font-bold leading-none" aria-hidden>
                            ×
                          </span>
                        </button>
                      </span>
                    ) : null}
                    <div className="relative min-w-0 flex-1">
                      {selectedCategory === "all" ? (
                        <LucideSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" aria-hidden />
                      ) : (
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ps-2.5 text-muted-foreground/85 sm:ps-3">
                          {fineSearchIconBusy ? (
                            <LoaderCircle
                              className="animate-spin text-muted-foreground"
                              size={16}
                              strokeWidth={2}
                              role="status"
                              aria-label="Se filtrează…"
                            />
                          ) : (
                            <LucideSearch size={16} strokeWidth={2} aria-hidden />
                          )}
                        </div>
                      )}
                      <Input
                        type="search"
                        suppressHydrationWarning
                        autoComplete="off"
                        placeholder={
                          marketplaceSearchText.trim() !== ""
                            ? undefined
                            : marketplaceSearchFocused
                              ? undefined
                              : selectedCategory === "all"
                                ? quickSearchTypewriter
                                : fineSearchTypewriter || "\u00a0"
                        }
                        value={marketplaceSearchText}
                        onChange={(e) =>
                          selectedCategory === "all"
                            ? setMarketplaceSearchText(e.target.value)
                            : handleMarketplaceSearchInputChange(e.target.value)
                        }
                        onFocus={() => setMarketplaceSearchFocused(true)}
                        onBlur={() => {
                          flushRoMarketplaceSearchUrl();
                          setMarketplaceSearchFocused(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitMarketplaceUrlSearch();
                          }
                        }}
                        className={cn(
                          "h-9 !text-sm leading-snug transition-colors placeholder:font-normal placeholder:text-muted-foreground sm:placeholder:font-medium max-sm:placeholder:text-[11px] max-sm:placeholder:leading-tight",
                          selectedCategory === "all"
                            ? "!pl-10 pr-3"
                            : "peer !pl-10 !pr-[2.85rem]",
                          marketplaceSearchText.trim() === ""
                            ? cn(
                                RO_SEARCH_INPUT_BORDER_EMPTY,
                                "bg-background text-foreground placeholder:text-muted-foreground",
                              )
                            : cn(
                                RO_SEARCH_INPUT_BORDER_FILLED,
                                "bg-background text-foreground",
                              ),
                        )}
                        aria-label={
                          selectedCategory === "all"
                            ? "Caută în toate anunțurile"
                            : "Caută în anunțuri (filtrate după categorie); marcă auto la început pentru piese auto"
                        }
                      />
                      {selectedCategory !== "all" ? (
                        <div className="pointer-events-auto absolute inset-y-0 end-0 z-10 flex items-center pe-1">
                          <button
                            type="button"
                            onClick={() => setSearchFinHelpOpen((o) => !o)}
                            aria-expanded={searchFinHelpOpen}
                            aria-haspopup="dialog"
                            aria-controls="search-fin-help-dialog"
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                              searchFinHelpOpen
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-label="Ajutor: căutare în lista afișată și exemple"
                          >
                            <i className="ri-information-line text-lg" aria-hidden />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="hidden min-w-0 shrink-0 items-center gap-2 lg:flex">
                    {selectedCategories.length > 1 ? (
                      <span className="text-muted-foreground inline-flex h-9 max-w-[10rem] items-center truncate rounded-md border border-dashed border-border px-2 text-xs">
                        {selectedCategories.length} categorii
                      </span>
                    ) : (
                      <Select value={selectedCategory} onValueChange={applyMarketplaceCategoryFromSelect}>
                        <SelectTrigger className="h-9 w-[160px]" aria-label="Categorie">
                          <SelectValue placeholder="Categorie" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Toate categoriile</SelectItem>
                          {categoryKeys
                            .filter((k) => k !== "all")
                            .map((key) => (
                              <SelectItem key={key} value={key}>
                                {(categories as Record<string, { name: string }>)[key]?.name ?? key}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="relative w-[180px] shrink-0">
                      <MapPin className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" aria-hidden />
                      <Input
                        placeholder="Toată România"
                        value={locationSearch}
                        onChange={(e) => handleLocationSearchChange(e.target.value)}
                        className="h-9 pl-9 pr-9"
                        aria-label="Căutare rapidă localitate"
                      />
                      <ChevronDown className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          {/* Mobile filters: Sheet stânga (bundle Marketplace) */}
          <Sheet
            open={showFilters}
            onOpenChange={(open) => {
              if (!open) closeMobileFiltersModal();
            }}
          >
            <SheetContent
              side="left"
              hideClose
              overlayClassName="z-[100090] bg-black/50"
              className="ro-filters-surface z-[100091] flex h-full max-h-[100dvh] w-full flex-col gap-0 border-r border-border bg-background p-0 sm:max-w-md"
            >
              <SheetHeader className="ro-filters-surface-header flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3 pr-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {filterModalMode === "precise" && (
                    <button
                      type="button"
                      onClick={() => setFilterModalMode("categories")}
                      className="text-foreground hover:bg-muted/80 -ml-1 shrink-0 touch-manipulation rounded-lg p-2 transition-colors"
                      aria-label="Înapoi la categorii"
                    >
                      <i className="ri-arrow-left-s-line text-xl leading-none" aria-hidden />
                    </button>
                  )}
                  <div className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal className="text-primary h-5 w-5 shrink-0" aria-hidden />
                    <SheetTitle className="truncate text-left text-lg font-semibold tracking-tight">
                      {filterModalMode === "categories" ? "Categorii" : "Filtre"}
                    </SheetTitle>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <SheetClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 touch-manipulation text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      aria-label="Închide filtrele"
                    >
                      <i className="ri-close-line text-2xl leading-none" aria-hidden />
                    </Button>
                  </SheetClose>
                </div>
              </SheetHeader>
              <ScrollArea
                className={
                  filterModalMode === "precise"
                    ? "min-h-0 flex-1 basis-0"
                    : "min-h-0 h-[calc(100dvh-60px)] flex-1"
                }
              >
                <div className={`pt-2 ${filterModalMode === "precise" ? "pb-4" : "px-1 pb-6 sm:px-2"}`}>
                  {filterModalMode === "categories" ? (
                    <div className="px-1 sm:px-2">{renderFiltersCategoriesOnly()}</div>
                  ) : (
                    <RoMobileMarketplaceFilters
                      location={locationSearch}
                      onLocationChange={handleLocationSearchChange}
                      radiusKm={locationRadiusKm}
                      onRadiusChange={(km) => setLocationRadiusKm(Math.max(0, Math.min(200, km)))}
                      category={selectedCategory === "all" ? "" : selectedCategory}
                      onCategoryChange={(value) => {
                        if (!value) {
                          setSelectedCategory("all");
                          setSelectedCategories([]);
                          setSelectedSubcategory("all");
                          setSelectedSubcategories([]);
                          setSelectedLevel3("all");
                        } else {
                          setSelectedCategory(value);
                          setSelectedCategories([value]);
                          setSelectedSubcategory("all");
                          setSelectedSubcategories([]);
                          setSelectedLevel3("all");
                        }
                      }}
                      categories={categoryKeys.map((key) => ({
                        value: key,
                        label: (categories as Record<string, { name: string }>)[key]?.name ?? key,
                      }))}
                      subcategories={mobileFilterSubcategoryOptions}
                      selectedSubcategories={activeSelectedSubcategories}
                      onSubcategoriesChange={applyMobileSubcategoriesChange}
                      priceMin={priceRange.min}
                      priceMax={priceRange.max}
                      onPriceChange={(next) => setPriceRange(next)}
                      selectedCurrency={selectedCurrency}
                      onCurrencyChange={setSelectedCurrency}
                      isDarkMode={isDarkMode}
                      freeOnly={marketplaceFreeOnly}
                      onFreeOnlyChange={(v) => {
                        setMarketplaceFreeOnly(v);
                        if (v) setPriceRange({ min: "", max: "" });
                      }}
                      condition={
                        selectedConditions.length === 0
                          ? "all"
                          : selectedConditions.includes("nou") || selectedConditions.includes("Nou")
                            ? "new"
                            : "used"
                      }
                      onConditionChange={(value: MarketplaceConditionValue) => {
                        if (value === "all") {
                          setSelectedConditions([]);
                          setCondition("all");
                        } else if (value === "new") {
                          setSelectedConditions(["nou"]);
                          setCondition("nou");
                        } else {
                          setSelectedConditions(["foarte-bun", "bun", "acceptabil", "necesită-reparații"]);
                          setCondition("all");
                        }
                      }}
                      datePosted={marketplaceDatePosted}
                      onDatePostedChange={setMarketplaceDatePosted}
                      delivery={marketplaceDelivery}
                      onDeliveryChange={setMarketplaceDelivery}
                      advancedFilters={renderFiltersContent(true, true, true)}
                      advancedOpen={mobileAdvancedOpen}
                      onAdvancedOpenChange={setMobileAdvancedOpen}
                      hideAdvancedTrigger
                      includeExecutariCrosslist={includeExecutariCrosslist}
                      onIncludeExecutariCrosslistChange={setIncludeExecutariCrosslist}
                      showExecutariCrosslistToggle={showExecutariCrosslistInFilters}
                      onUseMyLocation={() => applyMyLocationCenter({ closeMobileSheet: true })}
                      onUseNationwide={() => applyNationwideLocation({ closeMobileSheet: true })}
                      useMyLocationBusy={useMyLocationBusy}
                      hasLocationCenter={nearLat != null && nearLng != null}
                      resultsViewMode={viewMode}
                      onResultsViewModeChange={setViewMode}
                    />
                  )}
                </div>
              </ScrollArea>
              {filterModalMode === "precise" ? (
                <SheetFooter className="ro-filters-surface-footer shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-4">
                  <div className="flex w-full gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setMobileAdvancedOpen((v) => !v)}
                      aria-expanded={mobileAdvancedOpen}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
                      Filtrări avansate
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => {
                        saveFilters();
                        closeMobileFiltersModal();
                      }}
                    >
                      Salvează filtrele
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      clearFilters();
                      setMarketplaceDatePosted("all");
                      setMarketplaceDelivery([]);
                      setMarketplaceFreeOnly(false);
                    }}
                  >
                    Resetează filtrele
                  </Button>
                </SheetFooter>
              ) : null}
            </SheetContent>
          </Sheet>

          <LocationPermissionModal
            open={locationPermissionModalOpen}
            onOpenChange={(open) => {
              setLocationPermissionModalOpen(open);
              if (!open) {
                markLocationPromptSeen();
              }
            }}
            onUseApproximateLocation={confirmLocationPermissionModal}
            isBusy={useMyLocationBusy}
          />

          {/* Main Layout: Sidebar + Content */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Filtre desktop: fără înălțime fixă — derulare doar pe pagină, nu bară înlăuntrul coloanei */}
            <div className="hidden w-96 max-w-full flex-shrink-0 self-start lg:block">
              <div className="ro-filters-surface sticky top-24 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <div className="ro-filters-surface-header flex items-start justify-between gap-2 border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3">
                  <h2 className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold">
                    <SlidersHorizontal className="text-primary h-5 w-5 shrink-0" aria-hidden />
                    Filtre
                  </h2>
                  <span
                    className={cn(
                      "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums text-white",
                      marketplaceToolbarFilterCount > 0 ? "bg-neutral-950" : "invisible pointer-events-none",
                    )}
                    aria-hidden={marketplaceToolbarFilterCount === 0}
                  >
                    {marketplaceToolbarFilterCount > 0 ? marketplaceToolbarFilterCount : "\u00a0"}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="pb-3 pt-1">
                    <RoMobileMarketplaceFilters
                      location={locationSearch}
                      onLocationChange={handleLocationSearchChange}
                      radiusKm={locationRadiusKm}
                      onRadiusChange={(km) => setLocationRadiusKm(Math.max(0, Math.min(200, km)))}
                      category={selectedCategory === "all" ? "" : selectedCategory}
                      onCategoryChange={(value) => {
                        if (!value) {
                          setSelectedCategory("all");
                          setSelectedCategories([]);
                          setSelectedSubcategory("all");
                          setSelectedSubcategories([]);
                          setSelectedLevel3("all");
                        } else {
                          setSelectedCategory(value);
                          setSelectedCategories([value]);
                          setSelectedSubcategory("all");
                          setSelectedSubcategories([]);
                          setSelectedLevel3("all");
                        }
                      }}
                      categories={categoryKeys.map((key) => ({
                        value: key,
                        label: (categories as Record<string, { name: string }>)[key]?.name ?? key,
                      }))}
                      subcategories={mobileFilterSubcategoryOptions}
                      selectedSubcategories={activeSelectedSubcategories}
                      onSubcategoriesChange={applyMobileSubcategoriesChange}
                      priceMin={priceRange.min}
                      priceMax={priceRange.max}
                      onPriceChange={(next) => setPriceRange(next)}
                      selectedCurrency={selectedCurrency}
                      onCurrencyChange={setSelectedCurrency}
                      isDarkMode={isDarkMode}
                      freeOnly={marketplaceFreeOnly}
                      onFreeOnlyChange={(v) => {
                        setMarketplaceFreeOnly(v);
                        if (v) setPriceRange({ min: "", max: "" });
                      }}
                      condition={
                        selectedConditions.length === 0
                          ? "all"
                          : selectedConditions.includes("nou") || selectedConditions.includes("Nou")
                            ? "new"
                            : "used"
                      }
                      onConditionChange={(value: MarketplaceConditionValue) => {
                        if (value === "all") {
                          setSelectedConditions([]);
                          setCondition("all");
                        } else if (value === "new") {
                          setSelectedConditions(["nou"]);
                          setCondition("nou");
                        } else {
                          setSelectedConditions(["foarte-bun", "bun", "acceptabil", "necesită-reparații"]);
                          setCondition("all");
                        }
                      }}
                      datePosted={marketplaceDatePosted}
                      onDatePostedChange={setMarketplaceDatePosted}
                      delivery={marketplaceDelivery}
                      onDeliveryChange={setMarketplaceDelivery}
                      advancedFilters={renderFiltersContent(true, true, true)}
                      advancedOpen={mobileAdvancedOpen}
                      onAdvancedOpenChange={setMobileAdvancedOpen}
                      hideAdvancedTrigger
                      includeExecutariCrosslist={includeExecutariCrosslist}
                      onIncludeExecutariCrosslistChange={setIncludeExecutariCrosslist}
                      showExecutariCrosslistToggle={showExecutariCrosslistInFilters}
                      onUseMyLocation={() => applyMyLocationCenter({ closeMobileSheet: false })}
                      onUseNationwide={() => applyNationwideLocation({ closeMobileSheet: false })}
                      useMyLocationBusy={useMyLocationBusy}
                      hasLocationCenter={nearLat != null && nearLng != null}
                    />
                  </div>
                </div>
                <div className="shrink-0 space-y-2 border-t border-border bg-background p-3">
                  <div className="flex w-full gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setMobileAdvancedOpen((v) => !v)}
                      aria-expanded={mobileAdvancedOpen}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
                      Filtrări avansate
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => {
                        saveFilters();
                      }}
                    >
                      Salvează filtrele
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      clearFilters();
                      setMarketplaceDatePosted("all");
                      setMarketplaceDelivery([]);
                      setMarketplaceFreeOnly(false);
                    }}
                  >
                    Resetează filtrele
                  </Button>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 overflow-x-hidden">
              {/* Grid | Listă (stânga) + Lei | EUR (centrat) + Sortare (dreapta) — desktop, deasupra căutării */}
              <div className={`hidden lg:block mb-4 pb-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                <div
                  className="relative flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 lg:gap-4 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                  {/* Grid | Listă */}
                  <div className="relative z-10 flex shrink-0">
                  <div className={`relative inline-flex flex-shrink-0 rounded-xl p-1 transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${viewMode === 'grid'
                        ? isDarkMode ? 'bg-white text-gray-900 shadow-lg' : 'bg-white text-gray-900 shadow-md'
                        : isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        <span>Grid</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${viewMode === 'list'
                        ? isDarkMode ? 'bg-white text-gray-900 shadow-lg' : 'bg-white text-gray-900 shadow-md'
                        : isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                        <span>Listă</span>
                      </div>
                    </button>
                  </div>
                  </div>

                  {/* Lei | EUR — centrat pe lățimea barei (deasupra Grid/Sort pentru hit-test doar pe control) */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-1">
                    <div className="pointer-events-auto">
                      <div
                        className={`relative flex w-[18rem] max-w-[min(18rem,calc(100vw-12rem))] rounded-xl p-1 transition-colors ${isDarkMode ? 'bg-gray-700' : 'border border-gray-200 bg-white shadow-sm'}`}
                        role="tablist"
                        aria-label="Monedă afișare"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selectedCurrency === 'RON'}
                          onClick={() => setSelectedCurrency('RON')}
                          className={`relative flex-1 min-w-0 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${selectedCurrency === 'RON'
                            ? isDarkMode
                              ? 'bg-white text-gray-900 shadow-md'
                              : 'bg-slate-900 text-white shadow-sm'
                            : isDarkMode
                              ? 'text-gray-400 hover:text-white'
                              : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                          Lei
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selectedCurrency === 'EUR'}
                          onClick={() => setSelectedCurrency('EUR')}
                          className={`relative flex-1 min-w-0 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${selectedCurrency === 'EUR'
                            ? isDarkMode
                              ? 'bg-white text-gray-900 shadow-md'
                              : 'bg-slate-900 text-white shadow-sm'
                            : isDarkMode
                              ? 'text-gray-400 hover:text-white'
                              : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                          EUR
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sortare */}
                  <div className="relative z-10 flex min-w-0 max-w-[20rem] shrink">
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <span className={`text-sm font-medium flex shrink-0 items-center gap-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                        <i className="ri-sort-asc text-orange-500" aria-hidden />
                        <span className="hidden lg:inline">Sortare:</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <RoSortSelect
                          value={sortBy}
                          onValueChange={setSortBy}
                          options={RO_SORT_OPTIONS}
                          isDarkMode={isDarkMode}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Căutare catalog — desktop, sub Grid/Lei/Sort */}
              <div className="mb-4 hidden lg:block">
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                  {selectedCategory !== "all" && showSearchFinBrandChip && searchFinBrandChipDisplay ? (
                    <span
                      className={`inline-flex max-w-[min(100%,20rem)] min-w-0 shrink-0 items-center gap-1 rounded-xl border px-2 py-1.5 text-sm ${isDarkMode ? "border-gray-600 bg-gray-800/90 text-gray-200" : "border-gray-200 bg-white text-gray-800"}`}
                    >
                      <span className="min-w-0 truncate font-normal">{searchFinBrandChipDisplay}</span>
                      <button
                        type="button"
                        onClick={clearSearchFinBrandChip}
                        className="shrink-0 rounded p-0.5 text-red-600 transition-colors hover:bg-red-500/15 hover:text-red-700"
                        aria-label="Elimină marca (filtru Marca și căutare)"
                        title="Elimină marca"
                      >
                        <span className="text-lg font-bold leading-none" aria-hidden>
                          ×
                        </span>
                      </button>
                    </span>
                  ) : null}
                  <div className="relative min-w-0 flex-1">
                    {selectedCategory === "all" ? (
                      <LucideSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" aria-hidden />
                    ) : (
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center ps-3 text-muted-foreground/85">
                        {fineSearchIconBusy ? (
                          <LoaderCircle
                            className="animate-spin text-muted-foreground"
                            size={16}
                            strokeWidth={2}
                            role="status"
                            aria-label="Se filtrează…"
                          />
                        ) : (
                          <LucideSearch size={16} strokeWidth={2} aria-hidden />
                        )}
                      </div>
                    )}
                    <Input
                      type="search"
                      suppressHydrationWarning
                      autoComplete="off"
                      placeholder={
                        marketplaceSearchText.trim() !== ""
                          ? undefined
                          : marketplaceSearchFocused
                            ? undefined
                            : selectedCategory === "all"
                              ? quickSearchTypewriter
                              : fineSearchTypewriter || "\u00a0"
                      }
                      value={marketplaceSearchText}
                      onChange={(e) =>
                        selectedCategory === "all"
                          ? setMarketplaceSearchText(e.target.value)
                          : handleMarketplaceSearchInputChange(e.target.value)
                      }
                      onFocus={() => setMarketplaceSearchFocused(true)}
                      onBlur={() => {
                        flushRoMarketplaceSearchUrl();
                        setMarketplaceSearchFocused(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitMarketplaceUrlSearch();
                        }
                      }}
                      className={cn(
                        "h-9 !pl-10 pr-3 !text-sm leading-snug transition-colors placeholder:font-normal placeholder:text-muted-foreground sm:placeholder:font-medium max-sm:placeholder:text-[11px] max-sm:placeholder:leading-tight sm:h-10",
                        selectedCategory !== "all" && "!pr-12",
                        marketplaceSearchText.trim() === ""
                          ? cn(
                              RO_SEARCH_INPUT_BORDER_EMPTY,
                              "bg-background text-foreground placeholder:text-muted-foreground",
                            )
                          : cn(
                              RO_SEARCH_INPUT_BORDER_FILLED,
                              "bg-background text-foreground",
                            ),
                      )}
                      aria-label={
                        selectedCategory === "all"
                          ? "Caută în toate anunțurile"
                          : "Caută în anunțuri (filtrate după categorie); marcă auto la început pentru piese auto"
                      }
                    />
                    {selectedCategory !== "all" ? (
                      <div className="pointer-events-auto absolute inset-y-0 end-0 z-10 flex items-center pe-2">
                        <button
                          type="button"
                          onClick={() => setSearchFinHelpOpen((o) => !o)}
                          aria-expanded={searchFinHelpOpen}
                          aria-haspopup="dialog"
                          aria-controls="search-fin-help-dialog"
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                            searchFinHelpOpen
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          aria-label="Ajutor: căutare în lista afișată și exemple"
                        >
                          <i className="ri-information-line text-lg" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col min-w-0 overflow-visible">

                {selectedCategory !== 'all' && showSearchFinBrandChip && !searchFinBrandHintDismissed ? (
                  <div className="order-2 mb-6 w-full min-w-0 overflow-visible">
                    <div
                      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${isDarkMode ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-gray-50/80'}`}
                    >
                      <p className={`text-center text-xs sm:flex-1 sm:text-left ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {fineSearchLockedAutoBrand ? (
                          <>
                            Marca (ex.: BMW) din căutare rămâne activă până la apăsarea lui{' '}
                            <span className="font-semibold text-red-600">×</span>
                            ; după aceea poți introduce o altă marcă în câmp. Poți goli doar zona din dreapta (ex.: aripă albastră) fără a
                            elimina marca — lista rămâne filtrată după marcă.
                          </>
                        ) : (
                          <>
                            Marca selectată în filtre apare lângă căutare;{' '}
                            <span className="font-semibold text-red-600">×</span>
                            {' '}
                            scoate și filtrul Marca.
                          </>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handleSearchFinBrandHintOk}
                        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 ${isDarkMode
                          ? 'bg-orange-600/90 text-white hover:bg-orange-500'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                          }`}
                      >
                        OK, am înțeles
                      </button>
                    </div>
                  </div>
                ) : null}
                {searchFinHelpOpen &&
                  mounted &&
                  typeof document !== 'undefined' &&
                  createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[1200] bg-neutral-950/45 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setSearchFinHelpOpen(false)}
                        aria-hidden
                      />
                      <div
                        className="fixed inset-0 z-[1201] flex items-center justify-center pointer-events-none pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] sm:p-8"
                      >
                        <div
                          id="search-fin-help-dialog"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="search-fin-help-heading"
                          className={`pointer-events-auto w-full max-w-md max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem))] overflow-y-auto overscroll-contain rounded-2xl border shadow-[0_24px_64px_-12px_rgba(0,0,0,0.18)] animate-in zoom-in-95 fade-in duration-200 ${isDarkMode
                            ? 'border-neutral-800 bg-neutral-950 text-neutral-200'
                            : 'border-neutral-200/90 bg-white text-neutral-800'
                            }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className={`flex items-center justify-between gap-4 border-b px-5 py-4 ${isDarkMode ? 'border-neutral-800' : 'border-neutral-100'
                              }`}
                          >
                            <h2
                              id="search-fin-help-heading"
                              className={`min-w-0 text-[1.05rem] font-medium tracking-[-0.02em] ${isDarkMode ? 'text-neutral-100' : 'text-neutral-900'}`}
                            >
                              Căutare în anunțuri
                            </h2>
                            <button
                              type="button"
                              onClick={() => setSearchFinHelpOpen(false)}
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${isDarkMode
                                ? 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900'
                                }`}
                              aria-label="Închide"
                            >
                              <i className="ri-close-line text-[1.35rem]" aria-hidden />
                            </button>
                          </div>
                          <div
                            className={`space-y-5 px-5 py-5 text-[0.9375rem] leading-[1.55] ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}
                          >
                            <p className={isDarkMode ? 'text-neutral-200' : 'text-neutral-700'}>
                              Textul se trimite la server ca{' '}
                              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
                                căutare în tot catalogul
                              </span>{' '}
                              (cu filtrele tale: categorie, locație etc.), nu doar în pagina curentă. După ~0,4 s se actualizează lista și paginarea.
                            </p>
                            <div>
                              <p
                                className={`mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}
                              >
                                Cauți în
                              </p>
                              <ul className="list-disc space-y-1.5 pl-5 marker:text-neutral-400">
                                <li>titlu și descriere (fiecare cuvânt din text trebuie să apară în titlu sau descriere)</li>
                                <li>localitate, județ, adresă</li>
                                <li>preț (număr sau text)</li>
                                <li>
                                  marcă auto (ex. BMW, Mercedes): apare chenar verde lângă câmp; × roșu scoate doar marca;
                                  ștergerea textului din câmp nu scoate marca
                                </li>
                              </ul>
                            </div>
                            <div>
                              <p
                                className={`mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}
                              >
                                Plafon preț
                              </p>
                              <p className={`mb-2 text-sm ${isDarkMode ? 'text-neutral-500' : 'text-neutral-500'}`}>
                                Moneda afișată (Lei / EUR) dacă nu specifici altceva.
                              </p>
                              <ul className="list-disc space-y-1.5 pl-5 font-mono text-[0.8125rem] marker:text-neutral-400">
                                <li>maxim 500</li>
                                <li>până la 1500</li>
                                <li>max 200 eur</li>
                              </ul>
                            </div>
                            <div>
                              <p
                                className={`mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}
                              >
                                Exemple
                              </p>
                              <ul className="list-disc space-y-1.5 pl-5 font-mono text-[0.8125rem] marker:text-neutral-400">
                                <li>capotă albastră</li>
                                <li>injector cod 76G5IU7</li>
                              </ul>
                            </div>
                            <p
                              className={`border-t pt-4 text-xs leading-relaxed ${isDarkMode ? 'border-neutral-800 text-neutral-500' : 'border-neutral-100 text-neutral-500'}`}
                            >
                              Esc, ×, click în afara ferestrei sau din nou pe iconița de informații.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>,
                    document.body,
                  )}
              </div>

              {/* Image Search Info Banner */}
              {searchParams?.get('imageSearch') === 'true' && (
                <div className={`mb-6 p-4 rounded-lg border-2 ${isDarkMode
                  ? 'bg-gray-800 border-orange-500/50'
                  : 'bg-orange-50 border-orange-300'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                        {isImageSearching ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
                            Căutăm produse similare...
                          </span>
                        ) : imageSearchProductIds !== null ? (
                          imageSearchProductIds.length > 0 ? (
                            <span>Se afișează {imageSearchProductIds.length} {imageSearchProductIds.length === 1 ? 'produs similar' : 'produse similare'} găsite pentru această imagine</span>
                          ) : (
                            <span>Nu s-au găsit produse similare pentru această imagine. Se afișează toate produsele.</span>
                          )
                        ) : (
                          <span>Căutare după imagine activă</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.delete('imageSearch');
                        window.location.href = url.toString();
                      }}
                      className={`px-3 py-1 rounded text-sm transition-colors ${isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-white hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                      Șterge filtrarea
                    </button>
                  </div>
                </div>
              )}

              {/* Fallback ladder – bannere când rezultatele s-au lărgit (locație / categorie / termeni); doar după mount pentru a evita hydration mismatch */}
              {mounted && (ladderBase.reasonFlags.locationExpanded || ladderBase.reasonFlags.categoryExpanded || ladderBase.reasonFlags.termsReduced) && (primaryNonTest.length + supplementaryNonTest.length > 0) && (
                <div className={`mb-4 rounded-xl border px-4 py-3 ${isDarkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {ladderBase.reasonFlags.locationExpanded && (
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                        <i className="ri-map-pin-line mr-1" />
                        Nu avem rezultate în {location}. Îți arătăm rezultate din alte locații.
                      </span>
                    )}
                    {ladderBase.reasonFlags.categoryExpanded && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                        Inclusiv rezultate din categorii apropiate
                      </span>
                    )}
                    {ladderBase.reasonFlags.termsReduced && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                        Căutare extinsă
                      </span>
                    )}
                  </div>
                  <div className={`mt-2 h-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/30' : 'bg-blue-300/50'}`} />
                </div>
              )}

              {/* Nimic disponibil cu aceste filtre – afișează toate anunțurile ordonate după filtre */}
              {useFiltersFallback && (
                <div className={`mb-4 rounded-xl border px-4 py-3 ${isDarkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-amber-200' : 'text-amber-800'}`}>
                    Nimic disponibil cu aceste filtre deocamdată
                  </p>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-amber-200/80' : 'text-amber-700'}`}>
                    Afișăm toate anunțurile din categoria selectată, ordonate după filtrele tale
                  </p>
                  <div className={`mt-2 h-0.5 rounded-full ${isDarkMode ? 'bg-amber-500/30' : 'bg-amber-300/50'}`} />
                </div>
              )}

              {mounted && showGeoGeneralFallbackMessage && (
                <div
                  className={`mb-4 rounded-xl border px-4 py-3 ${isDarkMode ? "bg-sky-500/10 border-sky-500/35" : "bg-sky-50 border-sky-200"}`}
                  role="status"
                >
                  <p className={`text-sm font-medium ${isDarkMode ? "text-sky-100" : "text-sky-900"}`}>
                    No nearby listings found. Showing general results.
                  </p>
                </div>
              )}

              {/* Search orchestrator: loading / error / relax notice */}
              {isOrchestratorLoading && (
                <p className={`mb-2 text-sm ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>Optimizăm căutarea...</p>
              )}
              {orchestratorError && !isOrchestratorLoading && (
                <p className={`mb-2 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>{orchestratorError}</p>
              )}
              {orchestratorPlan?.uiHints?.showRelaxNotice && orchestratorPlan.uiHints.noticeText && !isOrchestratorLoading && (
                <p className={`mb-2 text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>{orchestratorPlan.uiHints.noticeText}</p>
              )}

              {/* Rezumat compact: X din Y · marcă · termeni căutare (fără ghilimele; termenii în albastru accent) */}
              <div className={`mb-1.5 sm:mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <div
                  className="text-[11px] sm:text-sm leading-none sm:leading-tight"
                  role="status"
                  aria-live="polite"
                >
                  {!mounted ? (
                    <span className={isDarkMode ? 'text-sky-300' : 'text-sky-700'}>
                      Se pregătesc rezultatele…
                    </span>
                  ) : SHOW_RELAXED_SUGGESTIONS_SECTION && visibleDisplayedList.length === 0 && relaxedSuggestionList.length > 0 ? (
                    <span className={isDarkMode ? 'text-amber-300' : 'text-amber-700'}>
                      Nu am găsit rezultate exacte · vezi rezultate extinse mai jos
                    </span>
                  ) : visibleDisplayedList.length === 0 ? (
                    <span className={isDarkMode ? 'text-sky-300' : 'text-sky-700'}>
                      {locationGeocodeBusy
                        ? "Se încarcă coordonatele localității pentru sortare după distanță…"
                        : isLoadingMoreRemote ||
                            isGeoRadiusRefreshing ||
                            isPageNavigating ||
                            isRouteTransitionPending ||
                            isOrchestratorLoading
                          ? "Căutăm cele mai apropiate rezultate…"
                          : listingsHasGeoCenter
                            ? locationRadiusKm > 0
                              ? `Nu am găsit anunțuri în raza de ${locationRadiusKm} km. Mărește raza din filtre sau alege fără limită la rază.`
                              : "Nu am găsit anunțuri pentru filtrele și localitatea curentă. Încearcă alte filtre sau altă localitate."
                            : "Nu am găsit anunțuri pentru filtrele curente."}
                    </span>
                  ) : canShowStrictTotalSummary && selectedCategory !== 'all' ? (
                    <>
                      <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>
                        {displayedRangeLabel} din {resultsSummaryTotalLabel ?? resultsSummaryDenominator.toLocaleString("ro-RO")}{" "}
                        rezultate
                      </span>
                      {resultsSummaryHasCompactQuery ? (
                        <>
                          {resultsSummaryCompactQueryParts.brand ? (
                            <>
                              {' '}
                              ·{' '}
                              <span
                                className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                              >
                                {resultsSummaryCompactQueryParts.brand}
                              </span>
                            </>
                          ) : null}
                          {resultsSummaryCompactQueryParts.q ? (
                            <>
                              {' '}
                              ·{' '}
                              <span
                                className={`font-semibold ${isDarkMode ? 'text-sky-300' : 'text-sky-800'}`}
                              >
                                {resultsSummaryCompactQueryParts.q}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : resultsSummaryCompactScopeLabel ? (
                        <>
                          {' '}
                          ·{' '}
                          <span
                            className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                          >
                            {resultsSummaryCompactScopeLabel}
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>Afișate {displayedRangeLabel}</span>
                      {resultsSummaryHasCompactQuery ? (
                        <>
                          {resultsSummaryCompactQueryParts.brand ? (
                            <>
                              {' '}
                              ·{' '}
                              <span
                                className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                              >
                                {resultsSummaryCompactQueryParts.brand}
                              </span>
                            </>
                          ) : null}
                          {resultsSummaryCompactQueryParts.q ? (
                            <>
                              {' '}
                              ·{' '}
                              <span
                                className={`font-semibold ${isDarkMode ? 'text-sky-300' : 'text-sky-800'}`}
                              >
                                {resultsSummaryCompactQueryParts.q}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : selectedCategory !== 'all' && resultsSummaryCompactScopeLabel ? (
                        <>
                          {' '}
                          ·{' '}
                          <span
                            className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                          >
                            {resultsSummaryCompactScopeLabel}
                          </span>
                        </>
                      ) : null}
                      {hasMore && (
                        <span className={isDarkMode ? 'text-amber-300' : 'text-amber-700'}> · Mai există rezultate</span>
                      )}
                      {isCompletingDisplayedResults && (
                        <span className={isDarkMode ? 'text-sky-300' : 'text-sky-700'}> · Se completează rezultatele…</span>
                      )}
                      {canShowStrictTotalSummary && resultsSummaryTotalLabel && (
                        <span> · Total: {resultsSummaryTotalLabel}</span>
                      )}
                    </>
                  )}
                  {mounted && geoSortSummaryParts && (
                      <span className={isDarkMode ? 'text-blue-300/90' : 'text-blue-700'}>
                        {' '}
                        ·{' '}
                        {geoSortSummaryParts.kmRounded != null ? (
                          <>
                            dintr-o rază de {geoSortSummaryParts.kmRounded} km față de {geoSortSummaryParts.cityLabel}
                          </>
                        ) : (
                          <>față de {geoSortSummaryParts.cityLabel}</>
                        )}
                      </span>
                    )}
                </div>
              </div>

              {/* Zero-Results Recovery: căutări alternative + relaxări filtre */}
              {primaryNonTest.length + supplementaryNonTest.length === 0 && recoveryData && (
                <div className="mb-6">
                  <SearchRecoveryCard
                    alternatives={recoveryData.alternatives}
                    relaxations={recoveryData.relaxations}
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}

              {/* Modele apropiate – când 0 rezultate și avem sugestii din DB */}
              {primaryNonTest.length + supplementaryNonTest.length === 0 && (searchParams?.get?.('q') ?? '').trim() && (
                <div className={`mb-6 rounded-xl border p-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                  {similarModelsLoading ? (
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Căutăm modele apropiate...</p>
                  ) : similarModelsSuggestions.length > 0 ? (
                    <>
                      <p className={`text-sm font-medium mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        Nu avem &quot;{(searchParams?.get?.('q') ?? '').trim()}&quot;. Modele similare:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {similarModelsSuggestions.map((s) => {
                          const params = new URLSearchParams(window.location.search);
                          params.set('q', s.label);
                          return (
                            <a
                              key={s.key}
                              href={`/ro?${params.toString()}`}
                              className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${isDarkMode
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50 hover:bg-orange-500/30'
                                : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
                                }`}
                            >
                              {s.label}
                            </a>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {showPersonalizedHomeStrip && viewMode === "grid" ? (
                <div className="mb-5 px-1 md:px-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2
                      className={cn(
                        "text-sm font-semibold tracking-tight sm:text-base",
                        isDarkMode ? "text-white" : "text-gray-900",
                      )}
                    >
                      Pentru tine
                    </h2>
                    <span
                      className={cn(
                        "max-w-[65%] truncate text-right text-[11px] sm:text-xs",
                        isDarkMode ? "text-gray-500" : "text-gray-500",
                      )}
                      title="Bazat pe căutările și interacțiunile tale recente"
                    >
                      După căutările tale
                    </span>
                  </div>
                  <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1 pt-0.5 [-webkit-overflow-scrolling:touch]">
                    {personalizedHomeItems.map((raw) => {
                      const auction = raw as Record<string, unknown>;
                      const imgVersion =
                        (auction as { updated_at?: string }).updated_at ??
                        (auction as { updatedAt?: string }).updatedAt ??
                        (auction as { createdAt?: string }).createdAt;
                      const displaySrc = getProductDisplayImage(auction);
                      const title = String((auction as { title?: string }).title ?? "").trim() || "Anunț";
                      return (
                        <button
                          key={String((auction as { id?: string }).id ?? (auction as { slug?: string }).slug ?? title)}
                          type="button"
                          onClick={() => openAuctionDetail(auction)}
                          className={cn(
                            "w-[42vw] max-w-[168px] shrink-0 overflow-hidden rounded-xl border text-left shadow-md transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:max-w-[180px]",
                            isDarkMode ? "border-white/15 bg-white/5 focus-visible:outline-white/40" : "border-gray-200 bg-white focus-visible:outline-gray-400",
                          )}
                        >
                          <div className={cn("relative h-28 border-b sm:h-32", isDarkMode ? "border-white/10" : "border-gray-100")}>
                            <ProgressiveImage
                              source={displaySrc}
                              variant="grid"
                              updatedAt={imgVersion}
                              focal={getFocalForImageUrl(
                                auction as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> },
                                displaySrc,
                              )}
                              alt=""
                              loading="lazy"
                              enableBlur={false}
                              sizes={CDN_IMAGE_SIZES_GRID}
                              imgClassName="h-full w-full object-cover object-center"
                            />
                          </div>
                          <div className="space-y-1 p-2">
                            <p
                              className={cn(
                                "line-clamp-2 text-[11px] font-semibold leading-snug sm:text-xs",
                                isDarkMode ? "text-white" : "text-gray-900",
                              )}
                              title={title}
                            >
                              {title}
                            </p>
                            <p className={cn("text-[11px] font-semibold sm:text-xs", isDarkMode ? "text-gray-200" : "text-gray-800")}>
                              {(() => {
                                const isFreeAuction = Boolean(
                                  (auction as { isFreeListing?: boolean }).isFreeListing ??
                                    (auction as { is_free_listing?: boolean }).is_free_listing ??
                                    false,
                                );
                                if (isFreeAuction) {
                                  return <span className="text-emerald-600 dark:text-emerald-400">Gratuit</span>;
                                }
                                const disp = getAuctionDisplayPriceInSelectedCurrency(auction as any, selectedCurrency);
                                return disp > 0 ? `${formatNumber(Number(disp))} ${selectedCurrency}` : "Preț la cerere";
                              })()}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Grid/List */}
              <div
                className={cn(
                  viewMode === 'grid'
                    ? (gridItemsWithPlacement?.length && !isMobile
                      ? 'grid gap-px px-1 md:px-0 md:gap-0.5 lg:gap-1 grid-cols-3'
                      : 'grid grid-cols-2 lg:grid-cols-3 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3')
                    : 'space-y-2 md:space-y-3',
                  isMarketplaceDataPending && "relative after:pointer-events-none after:absolute after:inset-0 after:animate-pulse after:rounded-lg after:bg-white/10 dark:after:bg-black/10",
                )}
              >
                  {shouldShowResultsSkeleton
                    ? Array.from({ length: viewMode === 'grid' ? 9 : 5 }).map((_, idx) => (
                        <div
                          key={`ro-results-skeleton-${idx}`}
                          className={cn(
                            "animate-pulse overflow-hidden rounded-xl border shadow-lg",
                            viewMode === 'list' ? "flex min-h-48" : "min-h-[298px] sm:min-h-[306px]",
                            isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200 bg-white",
                          )}
                        >
                          <div
                            className={cn(
                              viewMode === 'list' ? "h-48 w-48 shrink-0 md:h-56 md:w-56 lg:h-64 lg:w-80" : "h-40 sm:h-44 md:h-52",
                              isDarkMode ? "bg-white/10" : "bg-slate-100",
                            )}
                          />
                          <div className="space-y-3 p-3">
                            <div className={cn("h-3 w-4/5 rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-100")} />
                            <div className={cn("h-3 w-2/3 rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-100")} />
                            <div className={cn("h-4 w-1/2 rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-100")} />
                            <div className={cn("h-3 w-3/4 rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-100")} />
                          </div>
                        </div>
                      ))
                    : null}
                  {visibleDisplayedList.map((item, idx) => {
                    const auction = item;
                    const isUrgentAuction = Boolean((auction as any).isUrgent ?? (auction as any).is_urgent ?? false);
                    const cardIndex = idx;
                    const placement = placementByItem.get(auction);
                    const gridCol = placement ? placement.col : undefined;
                    const imgVersion =
                      (auction as { updated_at?: string; updatedAt?: string }).updated_at ??
                      (auction as { updatedAt?: string }).updatedAt ??
                      (auction as { createdAt?: string }).createdAt;
                    const displaySrc = getProductDisplayImage(auction);
                    const focalForCard = getFocalForImageUrl(
                      auction as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> },
                      displaySrc,
                    );
                    const imgUrl = getCdnImageUrl(displaySrc, listingGridTransformOptions(imgVersion, focalForCard));
                    /** Primele 6 carduri (2×3 pe mobil) fără lazy — altfel cardul + textul apar înainte de requestul de imagine. */
                    const isPriorityGridImage = viewMode === "grid" && cardIndex < 6;
                    const card = (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { openAuctionDetail(auction); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAuctionDetail(auction); } }}
                        className={`group backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl cursor-pointer ${viewMode === 'list' ? 'flex flex-row' : 'flex flex-col min-h-[298px] sm:min-h-[306px]'} ${isDarkMode
                          ? 'bg-white/10 border-white/20'
                          : 'bg-white border-gray-200'
                          }`}
                      >
                        {/* Imagine – prima cu fetchPriority=high pentru LCP (PageSpeed) */}
                        <div className={`relative ${viewMode === 'list' ? 'h-48 w-48 md:h-56 md:w-56 lg:h-64 lg:w-80 flex-shrink-0' : 'h-40 sm:h-44 md:h-52'} border ${isDarkMode ? 'border-gray-600' : 'border-white'}`}>
                          {viewMode === "grid" ? (
                            isPriorityGridImage ? (
                              <ProgressiveImage
                                source={displaySrc}
                                variant="grid"
                                updatedAt={imgVersion}
                                focal={getFocalForImageUrl(auction as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> }, displaySrc)}
                                alt=""
                                priority
                                enableBlur={false}
                                sizes={CDN_IMAGE_SIZES_GRID}
                                imgClassName="h-full w-full object-cover object-center"
                              />
                            ) : (
                              <ProgressiveImage
                                source={displaySrc}
                                variant="grid"
                                updatedAt={imgVersion}
                                focal={getFocalForImageUrl(auction as { image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }> }, displaySrc)}
                                alt=""
                                loading="lazy"
                                enableBlur={false}
                                sizes={CDN_IMAGE_SIZES_GRID}
                                imgClassName="h-full w-full object-cover object-center"
                              />
                            )
                          ) : cardIndex === 0 ? (
                            <Image
                              src={imgUrl}
                              alt=""
                              fill
                              priority
                              unoptimized
                              sizes="(max-width: 768px) 192px, 320px"
                              className="h-full w-full object-cover object-center"
                            />
                          ) : (
                            <Image
                              src={imgUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="(max-width: 768px) 192px, 320px"
                              className="object-cover object-center"
                              loading="lazy"
                            />
                          )}
                          {/* Badge-uri (stânga sus): Marcă (piese auto), Exclusiv, PREMIUM — Urgent se afișează după preț */}
                          {mounted && (() => {
                            const showMarcaPieseAuto =
                              isPieseAutoListingProduct(auction as { category?: string; subcategory?: string }) &&
                              getMarcaFromListing(auction as ListingMarcaFields).length > 0;
                            if (
                              !isLicitatiiPublice(auction) &&
                              !isPremiumAuction(auction) &&
                              !showMarcaPieseAuto
                            ) {
                              return null;
                            }
                            return (
                              <div className="absolute top-1 left-1 md:top-2 md:left-2 flex flex-col gap-1">
                                <PieseAutoMarcaInlineSpan listing={auction as any} />
                                {isLicitatiiPublice(auction) && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-md border border-blue-300/40 bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500">
                                    <i className="text-xs ri-shield-star-line"></i>
                                    Exclusiv
                                  </span>
                                )}
                                {isPremiumAuction(auction) && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-lg border border-yellow-300/50 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500">
                                    <i className="ri-vip-crown-2-line text-xs"></i>
                                    PREMIUM
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {/* Stamps pentru status (VÂNDUT / REZERVAT) - verde ca pe live_bid */}
                          {((auction as any).status === 'sold' || (auction as any).status === 'reserved') && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <div
                                className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-6 py-2 md:px-10 md:py-3 border-[8px] md:border-[10px] rounded-sm uppercase tracking-widest font-black leading-none text-2xl md:text-5xl ${(auction as any).status === 'sold'
                                  ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                  : 'border-amber-500 text-amber-600 bg-transparent'
                                  }`}
                              >
                                {(auction as any).status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
                              </div>
                            </div>
                          )}
                          {/* Stamp diagonal „În curs” (verde) – când anunțul e dezactivat în admin */}
                          {isLicitatiiPublice(auction) && (auction as any).status === 'in_progress' && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-4 py-1.5 md:px-6 md:py-2 border-[6px] md:border-[8px] rounded-sm uppercase tracking-widest font-black leading-none text-lg sm:text-xl md:text-3xl lg:text-4xl border-emerald-600 text-emerald-600 bg-transparent">
                                ÎN CURS
                              </div>
                            </div>
                          )}
                          {/* Stamp diagonal „Licitația s-a încheiat” – același stil ca VÂNDUT/REZERVAT */}
                          {isLicitatiiPublice(auction) && (auction as any).status !== 'sold' && (auction as any).status !== 'reserved' && (auction as any).status !== 'in_progress' && (() => {
                            const auctionDate = auction.auctionDate ? new Date(auction.auctionDate) : null;
                            const isEnded = !auctionDate || auctionDate.getTime() <= Date.now() || auction.timeLeft === 'Terminat';
                            if (!isEnded) return null;
                            return (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-4 py-1.5 md:px-6 md:py-2 border-[6px] md:border-[8px] rounded-sm uppercase tracking-widest font-black leading-none text-lg sm:text-xl md:text-3xl lg:text-4xl border-red-600 text-red-600 bg-transparent">
                                  ÎNCHEIATĂ
                                </div>
                              </div>
                            );
                          })()}
                          <div className="absolute top-1 right-1 md:top-2 md:right-2 flex space-x-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleFavorite(auction.id); }}
                              className={`gobid-heart-bounce p-0.5 rounded-full transition-all duration-300 shadow hover:shadow-md ${isAuctionFavorite(auction.id)
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : (isDarkMode
                                  ? 'bg-white/30 backdrop-blur-md text-red-300 hover:bg-white/40 ring-1 ring-white/20'
                                  : 'bg-white/85 backdrop-blur-md text-red-600 hover:bg-white ring-1 ring-black/10')
                                }`}
                              title={isAuctionFavorite(auction.id) ? 'Elimină din favorite' : 'Adaugă la favorite'}
                            >
                              <HeartIcon
                                size="m"
                                className={
                                  isAuctionFavorite(auction.id)
                                    ? 'text-white fill-white'
                                    : (isDarkMode ? 'text-red-200 drop-shadow-lg' : 'text-red-600 drop-shadow-lg')
                                }
                                strokeWidth={1.75}
                              />
                            </button>
                            {isLicitatiiPublice(auction) && (
                              <div className={`px-1 py-0.5 md:px-1.5 md:py-1 rounded-md shadow-md border flex items-center justify-center ${isAuctionUnlocked(auction)
                                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white border-green-400'
                                : 'bg-gradient-to-r from-red-600 to-red-500 text-white border-red-400'
                                }`}>
                                {isAuctionUnlocked(auction) ? (
                                  <LockOpenIcon size="s" className="text-white" strokeWidth={2} />
                                ) : (
                                  <LockClosedIcon size="s" className="text-white" strokeWidth={2} />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Cronometru pe poză (partea de jos) – pentru toate licitațiile publice; la încheiate afișăm 00 Zile 00 Ore 00 Min 00 Sec */}
                          {isLicitatiiPublice(auction) && (() => {
                            let days = 0, hours = 0, minutes = 0, seconds = 0;
                            if (auction.auctionDate) {
                              const auctionDate = new Date(auction.auctionDate);
                              const now = new Date();
                              const diffMs = auctionDate.getTime() - now.getTime();
                              if (diffMs > 0) {
                                const totalSeconds = Math.floor(diffMs / 1000);
                                days = Math.floor(totalSeconds / (24 * 3600));
                                hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
                                minutes = Math.floor((totalSeconds % 3600) / 60);
                                seconds = totalSeconds % 60;
                              }
                            }
                            return (
                              <div className="absolute bottom-0 left-0 right-0 p-1.5 md:p-2 bg-gradient-to-t from-black/20 to-transparent" suppressHydrationWarning>
                                <div className="grid grid-cols-4 gap-1">
                                  {[
                                    { value: days, label: 'Zile' },
                                    { value: hours, label: 'Ore' },
                                    { value: minutes, label: 'Min' },
                                    { value: seconds, label: 'Sec' },
                                  ].map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="text-center rounded p-1 border min-w-0 bg-white/45 border-gray-200/40 backdrop-blur-sm"
                                      suppressHydrationWarning
                                    >
                                      <div
                                        className="text-xs font-bold leading-tight text-gray-900"
                                        suppressHydrationWarning
                                      >
                                        {String(item.value).padStart(2, '0')}
                                      </div>
                                      <div className="text-[9px] font-medium text-gray-600">
                                        {item.label}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Content – grid: flex-1 umple înălțimea cardului după poză mai joasă */}
                        <div className={`${viewMode === 'list' ? 'pt-1.5 px-2 md:pt-2 md:px-2.5 pb-0.5 flex-1 min-w-0' : 'flex flex-1 flex-col gap-1.5 pt-2 px-2 pb-3 sm:px-2.5 sm:pb-3.5 min-h-0'}`}>
                          <div className="mb-0">
                            <h3
                              className={`${viewMode === 'list' ? 'text-sm md:text-base lg:text-lg' : 'text-xs md:text-base'} font-semibold leading-tight min-h-[2.4em] transition-colors ${isDarkMode ? 'text-white' : 'text-black'} line-clamp-2 group-hover:text-yellow-500 group-focus:text-yellow-500 group-active:text-yellow-500`}
                              title={auction.title}
                            >
                              {auction.title}
                            </h3>
                            {/* Tip: Licitație publică sau Nou/Uzat (anunțuri useri privați) */}
                            {(auction.saleType || auction.condition) && (
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap gap-y-0">
                                {isLicitatiiPublice(auction) ? (
                                  <>
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[11px] font-medium leading-tight bg-blue-500/20 text-blue-800 border border-blue-500/30">
                                      <i className="text-[10px] ri-auction-line"></i>
                                      Licitație Publică
                                    </span>
                                    {auction.saleType === 'licitatie-publica' && (
                                      <span className="text-[11px] text-gray-400 leading-tight">
                                        Data licitatiei: {auction.auctionDate && typeof auction.auctionDate === 'string'
                                          ? (() => {
                                            try {
                                              const date = new Date(auction.auctionDate);
                                              if (isNaN(date.getTime())) return 'în curs de actualizare';
                                              // Use consistent formatting to avoid hydration errors
                                              const day = date.getDate().toString().padStart(2, '0');
                                              const monthNames = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
                                              const month = monthNames[date.getMonth()];
                                              const year = date.getFullYear();
                                              const hours = date.getHours().toString().padStart(2, '0');
                                              const minutes = date.getMinutes().toString().padStart(2, '0');
                                              return `${day} ${month} ${year}, ${hours}:${minutes}`;
                                            } catch {
                                              return 'în curs de actualizare';
                                            }
                                          })()
                                          : 'în curs de actualizare'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <ProductConditionBadge
                                    kind={isConditionNew(auction.condition) ? "nou" : "uzat"}
                                    isDarkMode={isDarkMode}
                                    showIcon
                                    size="compact"
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Preț și timp – vizibil pe toate ecranele */}
                          <div className={`${viewMode === 'list' ? 'flex flex-row items-center gap-3 mb-0.5 md:mb-1' : 'mb-0.5'} block`}>
                            <div className="flex w-full min-w-0 items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 flex-wrap">
                                {isLicitatiiPublice(auction) && (
                                  <span className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Oferta:</span>
                                )}
                                {(() => {
                                  const isFreeAuction = Boolean((auction as any).isFreeListing ?? (auction as any).is_free_listing ?? false);
                                  if (isFreeAuction) {
                                    return (
                                      <span className="inline-flex items-center gap-1 text-xs md:text-sm font-normal text-emerald-600 transition-colors dark:text-emerald-400">
                                        <i className="ri-gift-line text-sm" aria-hidden />
                                        Oferit gratuit
                                      </span>
                                    );
                                  }
                                  const disp = getAuctionDisplayPriceInSelectedCurrency(auction as any, selectedCurrency);
                                  return (
                                    <span className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                      {(disp > 0) ? `${formatNumber(Number(disp))} ${selectedCurrency}` : 'Preț la cerere'}
                                    </span>
                                  );
                                })()}
                              </div>
                              {isUrgentAuction ? (
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                                  Urgent
                                  <UrgentListingTooltipIcon isDarkMode={isDarkMode} />
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Blurred + Deblochează doar pentru licitații publice; cardul se termină exact sub oraș */}
                          {isLicitatiiPublice(auction) && !isAuctionUnlocked(auction) ? (
                            <div className="relative mt-0 space-y-0">
                              {/* 1 Token + Deblochează – aproape sub notificare */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-0.5">
                                  <CoinsIcon size="s" className="text-yellow-500" />
                                  <span className={`text-xs font-medium ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>1 Token</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openAuctionDetail(auction);
                                  }}
                                  className="px-2 py-0.5 md:px-2.5 md:py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors text-xs font-medium"
                                >
                                  Deblochează
                                </button>
                              </div>
                              {/* Locație – doar orașul; cardul se taie exact sub acest rând */}
                              <div className="flex items-center space-x-1 leading-tight">
                                <LocationIcon size="s" className="text-gray-500 flex-shrink-0" />
                                <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{getLocationDisplayWithDistance(auction)}</span>
                              </div>
                              {/* Blur în afara fluxului ca să nu mai extindă cardul */}
                              <div className="absolute left-0 right-0 top-full mt-0 pointer-events-none select-none overflow-hidden max-h-0 opacity-0">
                                <div className="space-y-0.5 blur-sm">
                                  <div className="flex items-center space-x-1">
                                    <UserIcon size="s" className="text-gray-500" />
                                    <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Vânzător: {auction.seller}</span>
                                  </div>
                                  <div className="hidden md:flex items-center space-x-1">
                                    <ClockIcon size="s" className="text-gray-500" />
                                    <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Licitații: 8 participanți</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Unlocked content - Essential details + bid button */
                            <div className={`space-y-0.5 ${viewMode === 'grid' && !isLicitatiiPublice(auction) ? 'mt-auto pt-0.5' : 'mt-0.5'}`}>
                              {isLicitatiiPublice(auction) && (
                                <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} line-clamp-2`}>
                                  {auction.description}
                                </p>
                              )}
                              <div className="space-y-0 text-xs">
                                {isLicitatiiPublice(auction) && (
                                  <div className="flex justify-between">
                                    <span className={`transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Zonă:</span>
                                    <span className={`transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{getLocationDisplayWithDistance(auction)}</span>
                                  </div>
                                )}
                              </div>

                              {/* Google Maps pentru Imobiliare – componentă opțională */}
                              {auction.category === 'imobiliare' && (auction.address || auction.coordinates) && (
                                <div className="mt-4 h-48 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs text-gray-500">Hartă: {auction.address || (auction as any).coordinates}</span>
                                </div>
                              )}


                              {/* Locație + timp relativ: pe mobil data pe rând separat, dreapta, deasupra locației */}
                              {!isLicitatiiPublice(auction) && (() => {
                                const publishedAt = (auction as { createdAt?: string; auctionDate?: string }).createdAt || auction.auctionDate;
                                const addedText = mounted && publishedAt ? formatRelativeAddedTime(publishedAt) : '';
                                const dateEl = addedText ? (
                                  <span className={`shrink-0 text-xs transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                    {addedText}
                                  </span>
                                ) : null;
                                return (
                                  <div className="mt-0.5 flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-2 md:gap-y-0">
                                    {dateEl ? (
                                      <div className="flex justify-end md:hidden">{dateEl}</div>
                                    ) : null}
                                    <div className="flex min-w-0 items-center justify-between gap-2 md:contents">
                                      <span className={`min-w-0 inline-flex flex-1 items-center gap-1 truncate text-xs transition-colors md:flex-none ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                        <LocationIcon size="s" className="shrink-0 text-gray-500" />
                                        <span className="truncate">{getCompactLocationWithDistance(auction)}</span>
                                      </span>
                                      {dateEl ? (
                                        <span className={`hidden shrink-0 text-xs transition-colors md:inline ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                          {addedText}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    const listKey = `${String(auction.id ?? '')}-${idx}`;
                    const listingDomId = String(auction.id ?? auction.slug ?? '');
                    const cardWrapper = viewMode === 'grid' && placement && !isMobile ? (
                      <div key={listKey} data-ro-listing-id={listingDomId} style={{ gridRow: placement.row + 1, gridColumn: gridCol }} className="min-w-0">{card}</div>
                    ) : (
                      <div key={listKey} data-ro-listing-id={listingDomId} className={viewMode === 'grid' ? 'min-w-0' : undefined}>{card}</div>
                    );
                    return cardWrapper;
                  })}
              </div>

              {SHOW_RELAXED_SUGGESTIONS_SECTION && relaxedSuggestionList.length > 0 && (
                <section
                  className={cn(
                    "mt-8 rounded-2xl border p-4",
                    isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-gray-50/70",
                  )}
                  aria-label="Rezultate extinse"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className={cn("text-sm font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
                        Te-ar putea interesa
                      </h2>
                      <p className={cn("mt-1 text-xs", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                        Rezultate extinse, afișate separat de lista exactă.
                      </p>
                    </div>
                    {relaxedGapFillLoading && (
                      <span className={cn("inline-flex items-center gap-1 text-xs", isDarkMode ? "text-sky-300" : "text-sky-700")}>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Se completează
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {relaxedSuggestionList.map((auction, idx) => {
                      const imgVersion =
                        (auction as { updated_at?: string; updatedAt?: string }).updated_at ??
                        (auction as { updatedAt?: string }).updatedAt ??
                        (auction as { createdAt?: string }).createdAt;
                      const displaySrc = getProductDisplayImage(auction);
                      const price = getAuctionDisplayPriceInSelectedCurrency(auction as any, selectedCurrency);
                      return (
                        <button
                          key={`relaxed-${String((auction as any).id ?? (auction as any).slug ?? idx)}`}
                          type="button"
                          onClick={() => { window.location.href = (auction as any).url || `/licitatii-publice/${(auction as any).slug || (auction as any).id}`; }}
                          className={cn(
                            "group min-w-0 overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                            isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200 bg-white",
                          )}
                        >
                          <div className="h-36 overflow-hidden sm:h-40">
                            <ProgressiveImage
                              source={displaySrc}
                              variant="grid"
                              updatedAt={imgVersion}
                              alt=""
                              enableBlur={false}
                              sizes={CDN_IMAGE_SIZES_GRID}
                              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          </div>
                          <div className="space-y-1 p-3">
                            <h3 className={cn("line-clamp-2 text-xs font-semibold sm:text-sm", isDarkMode ? "text-white" : "text-gray-900")}>
                              {(auction as any).title}
                            </h3>
                            <p className={cn("truncate text-xs", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                              {getCompactLocationWithDistance(auction)}
                            </p>
                            <p className={cn("text-xs font-semibold", isDarkMode ? "text-gray-100" : "text-gray-900")}>
                              {price > 0 ? `${formatNumber(price)} ${selectedCurrency}` : "Preț la cerere"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {showRoPagination && visibleDisplayedList.length > 0 && (
                <WheelPaginationFooter isDarkMode={isDarkMode}>
                  <WheelPagination
                    totalPages={displayPaginationTotalPages}
                    currentPage={pendingPage ?? listingsUrlPage}
                    onPageChange={goToListingsPage}
                    onPrefetchPage={prefetchListingsPageHover}
                    canGoNext={hasMore}
                    isDarkMode={isDarkMode}
                    className={cn(
                      "transition-[box-shadow] duration-200",
                      isPageNavigating && "rounded-full shadow-[0_0_0_1px_rgba(56,189,248,0.35)]",
                    )}
                  />
                </WheelPaginationFooter>
              )}
            </div>
          </div>
        </div>
      </div>

      <ResurseUtileBlock links={resurseUtileLinks ?? []} />

      <RoPageFooter isDarkMode={isDarkMode} />

      {/* Add to Favorite List Modal */}
      {selectedProductForFavorite && (
        <AddToFavoriteListModal
          itemType="auction"
          isOpen={showFavoriteModal}
          onClose={() => {
            setShowFavoriteModal(false);
            setSelectedProductForFavorite(null);
          }}
          productId={selectedProductForFavorite.id}
          productTitle={selectedProductForFavorite.title}
          isDarkMode={isDarkMode}
          onSuccess={handleFavoriteModalSuccess}
        />
      )}
    </div>
  );
}

function RoAuctionsViewClient({
  resurseUtileLinks,
  initialListings,
  initialMarketplaceQ,
}: {
  resurseUtileLinks?: ResurseUtileLinkItem[];
  initialListings?: InitialListingsPayload;
  initialMarketplaceQ?: string;
} = {}) {
  /**
   * Do not pass RSC nodes as props (e.g. `<ResurseUtileServer />`): the client wraps them in
   * `<Suspense>` and the tree no longer matches SSR HTML. Pass JSON (`resurseUtileLinks`) instead.
   * Do not wrap in an extra Suspense here: nested Suspense inside streamed RSC output can close the
   * connection ("Connection closed") with the App Router.
   */
  return (
    <AuctionsPageContent
      resurseUtileLinks={resurseUtileLinks}
      initialListings={initialListings}
      initialMarketplaceQ={initialMarketplaceQ}
    />
  );
}

export { RoAuctionsViewClient };
export default RoAuctionsViewClient;
