/**
 * Logică partajată: import produse piese-auto în `products` pentru un user_id.
 * Folosit de POST /api/piese-auto/import-csv și de importul admin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { fetchProductFromUrl } from "@/lib/piese-auto/fetch-product";
import { enqueueImageMirrorJobsForProduct } from "@/lib/image-jobs/enqueue";
import { mirrorExternalUrlToR2ForImportUserWithRetries } from "@/lib/image-jobs/process-image-job";
import { drainImageJobsForProductId } from "@/lib/image-jobs/worker";
import { isUrlHostedOnOurR2 } from "@/lib/upload/is-r2-public-url";
import { resolveMirrorUserId } from "@/lib/upload/resolve-mirror-user-id";
import { enrichPieseAutoImportMetadata } from "@/lib/piese-auto/infer-from-title";
import {
  PIESE_AUTO_CATEGORY_SLUG,
  PIESE_AUTO_SUBCATEGORY_SLUG,
} from "@/lib/piese-auto/taxonomy-slugs";
import { normalizePieseAutoDescriptionImportCell } from "@/lib/live-bid/description-plain-text";
import { geocodeAddress } from "@/lib/maps/geocode";

export { PIESE_AUTO_CATEGORY_SLUG, PIESE_AUTO_SUBCATEGORY_SLUG } from "@/lib/piese-auto/taxonomy-slugs";

const CATEGORY = PIESE_AUTO_CATEGORY_SLUG;
const SUBCATEGORY = PIESE_AUTO_SUBCATEGORY_SLUG;
export const PIESE_AUTO_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1486262715619-67b85e0b08d9?auto=format&fit=crop&w=800&q=80";

/** După `enqueueImageMirrorJobsForProduct`: așteaptă worker-ul și păstrează în DB doar URL-uri R2 (compliance). */
async function drainMirrorJobsAndEnforceR2Images(
  supabaseAdmin: SupabaseClient,
  productId: string,
  rawImageCount: number
): Promise<void> {
  if (rawImageCount <= 0) return;
  const maxTicks = Math.min(200, Math.max(40, rawImageCount * 25));
  const drain = await drainImageJobsForProductId(supabaseAdmin, productId, maxTicks);
  if (drain.errors.length > 0) {
    console.warn("[piese-auto-import] drain image_jobs:", drain.errors.slice(0, 5));
  }
  const { data: productAfterMirror } = await supabaseAdmin
    .from("products")
    .select("images")
    .eq("id", productId)
    .maybeSingle();
  const mirroredImages = Array.isArray((productAfterMirror as { images?: unknown } | null)?.images)
    ? ((productAfterMirror as { images: unknown[] }).images as unknown[])
    : [];
  const allowedR2Only = mirroredImages.filter(
    (img): img is string =>
      typeof img === "string" && img.trim().length > 0 && isUrlHostedOnOurR2(img)
  );
  const nextImages = allowedR2Only.length > 0 ? allowedR2Only : [PIESE_AUTO_PLACEHOLDER_IMAGE];
  const { error: complianceErr } = await supabaseAdmin
    .from("products")
    .update({ images: nextImages, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (complianceErr) {
    console.warn("[piese-auto-import] compliance image overwrite:", complianceErr.message);
  }
}

export type PieseAutoImportInputRow = {
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
  /**
   * Din coloana CSV „stare” / „condition” (opțional).
   * Gol sau lipsă → **Second hand** (Uzat din oficiu). Non-gol → „Nou” doar dacă textul indică clar nou.
   */
  conditionCsv?: string | null;
};

type PieseAutoImportLocation = {
  label: string | null;
  city: string | null;
  county: string | null;
  coordinates?: { lat: number; lng: number };
};

function cleanImportLocationText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function composeImportLocationLabel(city: string | null, county: string | null): string | null {
  const parts = [city, county].map((v) => cleanImportLocationText(v)).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

async function resolveImportUserDashboardLocation(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<PieseAutoImportLocation> {
  let profile: Record<string, unknown> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("city, location, company_city, company_county, address, country")
      .eq("user_id", userId)
      .maybeSingle();
    profile = (data as Record<string, unknown> | null) ?? null;
  } catch (error) {
    console.warn("[piese-auto-import] Nu am putut citi locația din user_profiles:", error);
  }

  let userMeta: Record<string, unknown> = {};
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    userMeta = (data?.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  } catch {
    userMeta = {};
  }

  const city =
    cleanImportLocationText(profile?.city) ||
    cleanImportLocationText(profile?.location) ||
    cleanImportLocationText(profile?.company_city) ||
    cleanImportLocationText(userMeta.city) ||
    cleanImportLocationText(userMeta.location) ||
    cleanImportLocationText(userMeta.company_city) ||
    null;
  const county =
    cleanImportLocationText(profile?.company_county) ||
    cleanImportLocationText(userMeta.company_county) ||
    null;
  const label =
    composeImportLocationLabel(city, county) ||
    cleanImportLocationText(profile?.address) ||
    cleanImportLocationText(userMeta.address) ||
    cleanImportLocationText(profile?.country) ||
    cleanImportLocationText(userMeta.country) ||
    "România";

  let coordinates: { lat: number; lng: number } | undefined;
  if (label && label !== "România") {
    const geocoded = await geocodeAddress(label.includes("România") ? label : `${label}, România`, false);
    if (geocoded.success && Number.isFinite(geocoded.lat) && Number.isFinite(geocoded.lng)) {
      coordinates = { lat: geocoded.lat, lng: geocoded.lng };
    }
  }

  return { label, city, county, coordinates };
}

function resolveRowImportLocation(
  rowLocation: string | null,
  fallback: PieseAutoImportLocation
): PieseAutoImportLocation {
  const explicit = cleanImportLocationText(rowLocation);
  if (explicit) {
    return {
      label: explicit,
      city: explicit.includes(",") ? explicit.split(",")[0]?.trim() || explicit : explicit,
      county: fallback.county,
      coordinates: undefined,
    };
  }
  return fallback;
}

/** Import CSV piese-auto: fără celulă / celulă goală = Uzat (`Second hand`). „Nou” doar dacă e specificat explicit. */
export function resolveConditionForPieseAutoImportRow(
  explicitCell: string | undefined | null
): "Nou" | "Second hand" {
  const raw = typeof explicitCell === "string" ? explicitCell.trim() : "";
  if (!raw) return "Second hand";

  const s = raw.toLowerCase();
  const hasUzatHint =
    /\b(second[\s-]?hand|secondhand|\bsh\b|uzat[aă]?|utilizat[aă]?|folosit[aă]?|used)\b/.test(s) ||
    s === "second hand";
  const hasNouHint =
    /\b(nou|nouă|noua|new|nefolosit|unused)\b/.test(s) ||
    /\b(produs\s+nou|piesa\s+noua|piese\s+noi|stare\s+nou|oem\s+nou|nou\s+sigilat|in\s+folie)\b/.test(s);

  if (hasNouHint && !hasUzatHint) return "Nou";
  if (hasUzatHint) return "Second hand";
  if (s === "nou" || s === "nouă" || s === "noua") return "Nou";

  return "Second hand";
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSimpleHumanDescription(text: string): string {
  const lines = text.split(/\n/).map((line) => line.replace(/[ \t]+/g, " ").trim());
  let out = lines.join("\n").trim();
  if (!out) return out;
  out = out.replace(/\n{3,}/g, "\n\n");
  // Curățare SEO clasică ce apare la scrapere (doar la sfârșitul textului).
  out = out.replace(/\s+de\s+vanzare\s+din\s+categoria[\s\S]*$/i, "").trim();
  return out;
}

/** Evită spargerea la punct în „3.0”, „2.5” etc. la split-ul naiv de propoziții. */
const DECIMAL_DOT_SENTINEL = "\uE000";

function maskDecimalDotsForSentenceSplit(text: string): string {
  return text.replace(/(\d)\.(\d+)/g, `$1${DECIMAL_DOT_SENTINEL}$2`);
}

function unmaskDecimalDots(text: string): string {
  return text.replace(/\uE000/g, ".");
}

function formatDescriptionForReadability(text: string): string {
  const normalized = normalizeSimpleHumanDescription(text);
  if (!normalized) return normalized;

  // Dacă utilizatorul a pus deja rânduri (ex. `<br>` în CSV), nu refacem propozițiile în bloc.
  if (normalized.includes("\n")) {
    return normalized.replace(
      /\n?(Livrare\s+prin\s+curier(?:\s+[^.!?\n]*)?[.!?]?)/i,
      "\n\n$1"
    );
  }

  const masked = maskDecimalDotsForSentenceSplit(normalized);
  const sentences =
    masked.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

  if (sentences.length <= 1) {
    return unmaskDecimalDots(normalized).replace(
      /\s+(Livrare\s+prin\s+curier(?:\s+[^.!?\n]*)?[.!?]?)/i,
      "\n\n$1"
    );
  }

  return sentences
    .map(unmaskDecimalDots)
    .join("\n")
    .replace(/\n?(Livrare\s+prin\s+curier(?:\s+[^.!?\n]*)?[.!?]?)/i, "\n\n$1");
}

async function rewriteDescriptionSimpleHuman(
  args: { title: string; description: string },
  opts?: { skipOpenAI?: boolean }
): Promise<string> {
  const cleaned = normalizeSimpleHumanDescription(args.description);
  if (!cleaned) return cleaned;

  const nonEmptyLines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  const looksLikeStructuredHtmlImport =
    nonEmptyLines.length >= 6 ||
    (cleaned.includes("\n\n") && nonEmptyLines.length >= 4) ||
    nonEmptyLines.length >= 2 ||
    /compatibil\s+cu/i.test(cleaned) ||
    /^[•\-*‧]\s/m.test(cleaned) ||
    /\bLa\s+cerere\b/i.test(cleaned);

  /* Descrieri lungi din CSV/HTML (OLX): păstrăm rândurile și listele; GPT le-ar comprima la 2–3 fraze. */
  if (
    looksLikeStructuredHtmlImport ||
    opts?.skipOpenAI ||
    !process.env.OPENAI_API_KEY
  ) {
    return formatDescriptionForReadability(cleaned);
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Rescrii descrieri de piese auto in romana, foarte simplu si natural, ca un om. Fara ton de AI, fara marketing exagerat, fara emoji.",
          },
          {
            role: "user",
            content:
              `Titlu produs: ${args.title}\n` +
              `Descriere originala: ${cleaned}\n\n` +
              "Cerințe stricte:\n" +
              "1) Păstrează informațiile tehnice esențiale.\n" +
              "2) Elimină repetițiile și formulările SEO de tip 'de vanzare din categoria'.\n" +
              "3) Max 2-3 propoziții scurte, clare.\n" +
              "4) Returnează DOAR descrierea finală, text simplu.",
          },
        ],
      }),
    });
    if (!res.ok) return cleaned;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return formatDescriptionForReadability(cleaned);
    return formatDescriptionForReadability(content);
  } catch {
    return formatDescriptionForReadability(cleaned);
  }
}

/** Același format ca la „generare cod” în dashboard (PIES + 6): ex. PIES8DHYO2. */
const PIESE_AUTO_SKU_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PIESE_AUTO_SKU_PREFIX = "PIES";
const PIESE_AUTO_SKU_SUFFIX_LEN = 6;

function generatePieseAutoImportSku(usedInBatch: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(PIESE_AUTO_SKU_SUFFIX_LEN));
    let suffix = "";
    for (let i = 0; i < PIESE_AUTO_SKU_SUFFIX_LEN; i++) {
      suffix += PIESE_AUTO_SKU_CHARSET[bytes[i]! % PIESE_AUTO_SKU_CHARSET.length];
    }
    const sku = `${PIESE_AUTO_SKU_PREFIX}${suffix}`;
    if (!usedInBatch.has(sku)) {
      usedInBatch.add(sku);
      return sku;
    }
  }
  const fallback = `${PIESE_AUTO_SKU_PREFIX}${crypto.randomUUID().replace(/-/g, "").slice(0, PIESE_AUTO_SKU_SUFFIX_LEN).toUpperCase()}`;
  usedInBatch.add(fallback);
  return fallback;
}

/** URL absolut pentru enqueue (//host → https://host). */
function normalizeExternalImageUrl(u: string): string {
  const t = u.trim();
  if (!t) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function parsePrice(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[\s,]+/g, "").replace(/[a-zA-Z]+/g, "");
    const num = Number(cleaned);
    if (!Number.isNaN(num)) return Math.round(num * 100) / 100;
  }
  return 0;
}

export type PieseAutoImportPerRowResult =
  | { status: "created"; productId: string }
  | { status: "duplicate" }
  | { status: "failed"; error: string };

export type PieseAutoImportResult = {
  success: true;
  createdCount: number;
  failedCount: number;
  skippedDuplicates: number;
  createdIds: string[];
  failed: Array<{ title: string; error: string }>;
  message: string;
  errorDetail?: string;
  /** Aliniat la `rawProducts[i]` (același număr de intrări ca la apel). */
  perRow: PieseAutoImportPerRowResult[];
};

export type PieseAutoImportOptions = {
  forceDuplicate?: boolean;
  /**
   * Fără re-scrape URL (pieseauto/olx) și fără GPT pe descriere.
   * Dacă e activ fără `turbo`: nu așteaptă `image_jobs` — URL-urile externe pot rămâne
   * pe rând până le preia worker-ul (nu recomandat când vrei strict R2).
   */
  fastImport?: boolean;
  /**
   * Import admin turbo: rapid pentru text (fără scrape / GPT) și **așteaptă** oglinzirea în R2
   * (drain + compliance), la fel ca modul complet — fără URL-uri terțe rămase în `products.images`.
   */
  turbo?: boolean;
};

function readBoundedIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

const FAST_IMPORT_INSERT_CONCURRENCY = readBoundedIntEnv(
  "PIESE_AUTO_IMPORT_INSERT_CONCURRENCY",
  16,
  4,
  24
);
/** Fetch→R2 în paralel pentru import rapid. Rapid, dar sub nivelul vechi care putea satura DB/R2. */
const MIRROR_URL_CONCURRENCY = readBoundedIntEnv(
  "PIESE_AUTO_IMPORT_MIRROR_CONCURRENCY",
  32,
  8,
  56
);
const MAX_IMPORT_IMAGES_PER_ROW = 8;

async function mirrorFastPendingUrlsToR2(
  supabaseAdmin: SupabaseClient,
  userId: string,
  pending: FastRowContext[]
): Promise<void> {
  if (pending.length === 0) return;
  const mirrorUserId = resolveMirrorUserId(userId);
  if (!mirrorUserId) {
    console.warn("[piese-auto-import] mirror: lipsește user pentru R2 (resolveMirrorUserId).");
    return;
  }

  const flat: Array<{ ctx: FastRowContext; i: number; url: string }> = [];
  for (const ctx of pending) {
    ctx.images = new Array(ctx.rawImages.length);
    for (let i = 0; i < ctx.rawImages.length; i++) {
      flat.push({ ctx, i, url: ctx.rawImages[i]! });
    }
  }

  const lim = pLimit(MIRROR_URL_CONCURRENCY);
  await Promise.all(
    flat.map(({ ctx, i, url }) =>
      lim(async () => {
        try {
          const stem = `${slugify(ctx.title).slice(0, 60)}-${ctx.index}-${i}`;
          ctx.images[i] = await mirrorExternalUrlToR2ForImportUserWithRetries(
            supabaseAdmin,
            mirrorUserId,
            url,
            stem
          );
        } catch (e) {
          console.warn("[piese-auto-import] mirror eșuat după retry:", url, e);
          ctx.images[i] = PIESE_AUTO_PLACEHOLDER_IMAGE;
        }
      })
    )
  );
}

/** O singură interogare per lot în loc de N SELECT-uri pentru același user + external_id. */
async function prefetchExistingExternalIdsForBatch(
  supabaseAdmin: SupabaseClient,
  userId: string,
  externalIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(externalIds.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();

  const found = new Set<string>();
  const CHUNK = 60;

  for (let c = 0; c < unique.length; c += CHUNK) {
    const chunk = unique.slice(c, c + CHUNK);
    const inList = `(${chunk.map((id) => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("custom_fields")
      .eq("user_id", userId)
      .eq("subcategory", SUBCATEGORY)
      .filter("custom_fields->>source_external_id", "in", inList);

    if (error) {
      console.warn("[piese-auto-import] prefetch external ids:", error.message);
      throw new Error(
        "Nu am putut verifica duplicatele înainte de import. Reîncearcă lotul; importul a fost oprit ca să nu suprasolicite baza de date."
      );
    }
    for (const row of data ?? []) {
      const cf = row?.custom_fields as { source_external_id?: unknown } | null | undefined;
      const id =
        typeof cf?.source_external_id === "string" ? cf.source_external_id.trim() : "";
      if (id) found.add(id);
    }
  }

  return found;
}

type FastRowContext = {
  index: number;
  title: string;
  rawImages: string[];
  images: string[];
  description: string;
  price: number;
  uniqueSlug: string;
  externalId: string | null;
  specifications: Record<string, string>;
  livrareSiPlata: string;
  location: string | null;
  locationCity: string | null;
  locationCounty: string | null;
  locationCoordinates?: { lat: number; lng: number };
  inferred: ReturnType<typeof enrichPieseAutoImportMetadata>;
  condition: ReturnType<typeof resolveConditionForPieseAutoImportRow>;
};

function buildInsertDataForFastRow(userId: string, ctx: FastRowContext, sku: string) {
  const {
    title,
    images,
    description,
    price,
    uniqueSlug,
    externalId,
    specifications,
    livrareSiPlata,
    location,
    locationCity,
    locationCounty,
    locationCoordinates,
    inferred,
    condition,
  } = ctx;

  return {
    title,
    description,
    category: CATEGORY,
    subcategory: SUBCATEGORY,
    ...(inferred.brand ? { brand: inferred.brand } : {}),
    ...(inferred.categoryLevel3 ? { category_level_3: inferred.categoryLevel3 } : {}),
    starting_price: price,
    starting_price_ron: price,
    starting_price_eur: null,
    currency: "RON",
    product_type: "live-bid",
    status: "active",
    channel: "ro",
    requires_token: false,
    condition,
    city: locationCity,
    county: locationCounty,
    product_location: location,
    ...(locationCoordinates && { coordinates: locationCoordinates }),
    sku,
    images,
    slug: uniqueSlug,
    url: `/live_bid/${uniqueSlug}`,
    user_id: userId,
    custom_fields: {
      has_no_expiration: true,
      cod_anunt: sku,
      ...(externalId && { source_external_id: externalId, source: "pieseauto" }),
      ...(location && { locatie: location }),
      ...(locationCity && { city: locationCity, oras: locationCity }),
      ...(locationCounty && { county: locationCounty, judet: locationCounty }),
      ...(locationCoordinates && { coordinates: locationCoordinates }),
      ...(Object.keys(specifications).length > 0 && { specificatii: specifications }),
      ...(livrareSiPlata && { livrare_si_plata: livrareSiPlata }),
      ...(inferred.marca && { marca: inferred.marca }),
      ...(inferred.tipPiesa && { tipPiesa: inferred.tipPiesa }),
    },
    documents: [],
  };
}

export async function importPieseAutoProductsForUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
  rawProducts: PieseAutoImportInputRow[],
  options: PieseAutoImportOptions
): Promise<PieseAutoImportResult> {
  const forceDuplicate = !!options.forceDuplicate;
  const turbo = !!options.turbo;
  /** Rapid UI: skip scrape + GPT. Turbo îl include mereu. */
  const fastImportEffective = !!options.fastImport || turbo;
  /** Doar „import rapid” fără turbo: nu blocăm pe drain (worker ulterior). Turbo și modul complet: R2 sincron. */
  const deferR2MirrorToWorker = !!options.fastImport && !turbo;
  const existingSlugs: string[] = [];
  const skusUsedInBatch = new Set<string>();
  const createdIds: string[] = [];
  const failed: Array<{ title: string; error: string }> = [];
  const perRow: PieseAutoImportPerRowResult[] = new Array(rawProducts.length);
  let skippedDuplicates = 0;
  const dashboardLocationFallback = await resolveImportUserDashboardLocation(supabaseAdmin, userId);

  const externalIdsForPrefetch = rawProducts
    .map((r) => (typeof r.externalId === "string" ? r.externalId.trim() : ""))
    .filter(Boolean);
  const existingExternalIds = forceDuplicate
    ? new Set<string>()
    : await prefetchExistingExternalIdsForBatch(supabaseAdmin, userId, externalIdsForPrefetch);

  /** Primul rând cu același external_id în acest batch câștigă; următorul e marcat duplicate (ca la import secvențial în DB). */
  const externalIdReservedInBatch = new Set<string>();

  const fastPending: FastRowContext[] = [];

  for (let i = 0; i < rawProducts.length; i++) {
    const row = rawProducts[i]!;
    let resolvedRow = { ...row };

    const sourceUrl =
      !fastImportEffective &&
      typeof row.url === "string" &&
      row.url.trim() &&
      /pieseauto\.ro|olx\.ro/i.test(row.url)
        ? row.url.trim()
        : null;
    if (sourceUrl) {
      try {
        const result = await fetchProductFromUrl(sourceUrl);
        if (result.success && result.product) {
          const p = result.product;
          const keepCsvTitle = hasNonEmptyString(resolvedRow.title);
          const keepCsvDescription = hasNonEmptyString(resolvedRow.description);
          resolvedRow = {
            ...resolvedRow,
            // Nu suprascriem titlul/descrierea din CSV (cerință import admin piese-auto).
            // Datele din URL sunt fallback doar când câmpul lipsește în CSV.
            title: keepCsvTitle ? resolvedRow.title : (p.title ?? resolvedRow.title),
            description: keepCsvDescription
              ? resolvedRow.description
              : (p.description ?? resolvedRow.description ?? ""),
            price: p.price ?? resolvedRow.price ?? 0,
            imageUrls:
              Array.isArray(p.imageUrls) && p.imageUrls.length > 0
                ? p.imageUrls
                : resolvedRow.image
                  ? [resolvedRow.image]
                  : [],
            specifications: p.specifications ?? resolvedRow.specifications ?? {},
            livrareSiPlata: p.livrareSiPlata ?? resolvedRow.livrareSiPlata ?? "",
            externalId: p.externalId ?? resolvedRow.externalId ?? null,
            location: p.location ?? resolvedRow.location ?? null,
          };
        }
      } catch {
        /* continuă cu CSV */
      }
    }

    const title =
      typeof resolvedRow.title === "string" ? resolvedRow.title.trim() : String(resolvedRow?.title ?? "").trim();
    if (!title) {
      perRow[i] = { status: "failed", error: "Titlul este obligatoriu." };
      failed.push({ title: "(fără titlu)", error: "Titlul este obligatoriu." });
      continue;
    }

    const externalId =
      typeof resolvedRow.externalId === "string" && resolvedRow.externalId.trim()
        ? resolvedRow.externalId.trim()
        : null;

    if (externalId && !forceDuplicate) {
      if (existingExternalIds.has(externalId)) {
        skippedDuplicates++;
        perRow[i] = { status: "duplicate" };
        continue;
      }
      if (externalIdReservedInBatch.has(externalId)) {
        skippedDuplicates++;
        perRow[i] = { status: "duplicate" };
        continue;
      }
      externalIdReservedInBatch.add(externalId);
    }

    let description =
      typeof resolvedRow.description === "string"
        ? resolvedRow.description.trim()
        : String(resolvedRow?.description ?? "").trim();
    if (!description) description = title;
    /** Pipeline unic pentru celula „descriere” din CSV (HTML sau nu, 1–N paragrafe). */
    description = normalizePieseAutoDescriptionImportCell(description);
    if (!description.trim()) description = title;
    // Aplicăm curățare/rescriere simplă inclusiv pentru descrieri venite din CSV
    // (aici apare frecvent dublarea SEO în fișierele sursă).
    description = await rewriteDescriptionSimpleHuman(
      { title, description },
      { skipOpenAI: fastImportEffective }
    );
    const price = parsePrice(resolvedRow?.price ?? 0);
    const imageUrls = Array.isArray(resolvedRow?.imageUrls)
      ? resolvedRow.imageUrls
          .filter((u: unknown) => typeof u === "string" && (u as string).trim())
          .map((u) => normalizeExternalImageUrl(u as string))
      : [];
    const singleImage =
      typeof resolvedRow.image === "string" && resolvedRow.image.trim()
        ? normalizeExternalImageUrl(resolvedRow.image.trim())
        : "";
    const rawImages = (
      imageUrls.length > 0 ? imageUrls : singleImage ? [singleImage] : [PIESE_AUTO_PLACEHOLDER_IMAGE]
    ).slice(0, MAX_IMPORT_IMAGES_PER_ROW);
    const images = rawImages;

    const specifications =
      resolvedRow?.specifications && typeof resolvedRow.specifications === "object"
        ? resolvedRow.specifications
        : {};
    const livrareSiPlata =
      typeof resolvedRow?.livrareSiPlata === "string" ? resolvedRow.livrareSiPlata.trim() : "";
    const location =
      typeof resolvedRow?.location === "string" && resolvedRow.location.trim() ? resolvedRow.location.trim() : null;
    const resolvedLocation = resolveRowImportLocation(location, dashboardLocationFallback);
    const finalLocation = resolvedLocation.label ?? dashboardLocationFallback.label ?? "România";

    const inferred = enrichPieseAutoImportMetadata({
      title,
      description,
      specifications: specifications as Record<string, string>,
    });
    const explicitCondition =
      typeof resolvedRow.conditionCsv === "string" ? resolvedRow.conditionCsv : null;
    const condition = resolveConditionForPieseAutoImportRow(explicitCondition);

    const baseSlug = slugify(title);
    const uniqueSlug = forceDuplicate
      ? `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      : generateUniqueSlug(baseSlug, existingSlugs);
    existingSlugs.push(uniqueSlug);

    if (fastImportEffective) {
      fastPending.push({
        index: i,
        title,
        rawImages,
        images,
        description,
        price,
        uniqueSlug,
        externalId,
        specifications: specifications as Record<string, string>,
        livrareSiPlata,
        location: finalLocation,
        locationCity: resolvedLocation.city,
        locationCounty: resolvedLocation.county,
        locationCoordinates: resolvedLocation.coordinates,
        inferred,
        condition,
      });
      continue;
    }

    let inserted: { id: string } | null = null;
    let insertError: { message: string } | null = null;

    for (let skuAttempt = 0; skuAttempt < 10; skuAttempt++) {
      const sku = generatePieseAutoImportSku(skusUsedInBatch);

      const insertData = {
        title,
        description,
        category: CATEGORY,
        subcategory: SUBCATEGORY,
        ...(inferred.brand ? { brand: inferred.brand } : {}),
        ...(inferred.categoryLevel3 ? { category_level_3: inferred.categoryLevel3 } : {}),
        starting_price: price,
        starting_price_ron: price,
        starting_price_eur: null,
        currency: "RON",
        product_type: "live-bid",
        status: "active",
        channel: "ro",
        requires_token: false,
        condition,
        city: resolvedLocation.city,
        county: resolvedLocation.county,
        product_location: finalLocation,
        ...(resolvedLocation.coordinates && { coordinates: resolvedLocation.coordinates }),
        sku,
        images,
        slug: uniqueSlug,
        url: `/live_bid/${uniqueSlug}`,
        user_id: userId,
        custom_fields: {
          has_no_expiration: true,
          cod_anunt: sku,
          ...(externalId && { source_external_id: externalId, source: "pieseauto" }),
          locatie: finalLocation,
          ...(resolvedLocation.city && { city: resolvedLocation.city, oras: resolvedLocation.city }),
          ...(resolvedLocation.county && { county: resolvedLocation.county, judet: resolvedLocation.county }),
          ...(resolvedLocation.coordinates && { coordinates: resolvedLocation.coordinates }),
          ...(Object.keys(specifications).length > 0 && { specificatii: specifications }),
          ...(livrareSiPlata && { livrare_si_plata: livrareSiPlata }),
          ...(inferred.marca && { marca: inferred.marca }),
          ...(inferred.tipPiesa && { tipPiesa: inferred.tipPiesa }),
        },
        documents: [],
      };

      const { data: ins, error } = await supabaseAdmin
        .from("products")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema row shape vs generated types
        .insert(insertData as any)
        .select("id")
        .single();

      if (!error && ins && typeof ins === "object" && "id" in ins) {
        inserted = ins as { id: string };
        insertError = null;
        break;
      }

      if (error) {
        const msg = error.message;
        const isDuplicateSlug =
          /duplicate key.*products_slug_key|products_slug_key|unique constraint.*slug/i.test(msg);
        if (isDuplicateSlug) {
          insertError = error;
          break;
        }
        const isDuplicateSku =
          /sku|products_sku/i.test(msg) && /unique|duplicate/i.test(msg);
        if (isDuplicateSku && skuAttempt < 9) {
          continue;
        }
        insertError = error;
        break;
      }
      insertError = { message: "Insert fără răspuns." };
      break;
    }

    if (insertError || !inserted) {
      const msg = insertError?.message ?? "Eroare la creare produs.";
      const isDuplicateSlug =
        /duplicate key.*products_slug_key|products_slug_key|unique constraint.*slug/i.test(msg);
      const errText = isDuplicateSlug ? "Anunț deja adăugat (există deja acest anunț)." : msg;
      perRow[i] = { status: "failed", error: errText };
      failed.push({
        title,
        error: errText,
      });
      continue;
    }
    const insertedId =
      inserted && typeof inserted === "object" && "id" in inserted ? (inserted as { id: string }).id : null;
    if (insertedId) {
      createdIds.push(insertedId);
      perRow[i] = { status: "created", productId: insertedId };
      if (rawImages.length > 0) {
        await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
          productId: insertedId,
          userId,
          imageUrls: rawImages,
        });
        if (!deferR2MirrorToWorker) {
          await drainMirrorJobsAndEnforceR2Images(supabaseAdmin, insertedId, rawImages.length);
        }
      }
    }
  }

  if (fastPending.length > 0) {
    await mirrorFastPendingUrlsToR2(supabaseAdmin, userId, fastPending);

    const fastJobs = fastPending.map((ctx) => ({
      ctx,
      firstSku: generatePieseAutoImportSku(skusUsedInBatch),
    }));

    let skuGate = Promise.resolve();
    const nextSkuExclusive = () =>
      new Promise<string>((resolve, reject) => {
        skuGate = skuGate
          .then(() => resolve(generatePieseAutoImportSku(skusUsedInBatch)))
          .catch(reject);
      });

    const limit = pLimit(FAST_IMPORT_INSERT_CONCURRENCY);
    await Promise.all(
      fastJobs.map(({ ctx, firstSku }) =>
        limit(async () => {
          let sku = firstSku;
          let inserted: { id: string } | null = null;
          let insertError: { message: string } | null = null;

          for (let skuAttempt = 0; skuAttempt < 10; skuAttempt++) {
            const insertData = buildInsertDataForFastRow(userId, ctx, sku);
            const { data: ins, error } = await supabaseAdmin
              .from("products")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema row shape vs generated types
              .insert(insertData as any)
              .select("id")
              .single();

            if (!error && ins && typeof ins === "object" && "id" in ins) {
              inserted = ins as { id: string };
              insertError = null;
              break;
            }

            if (error) {
              const msg = error.message;
              const isDuplicateSlug =
                /duplicate key.*products_slug_key|products_slug_key|unique constraint.*slug/i.test(msg);
              if (isDuplicateSlug) {
                insertError = error;
                break;
              }
              const isDuplicateSku =
                /sku|products_sku/i.test(msg) && /unique|duplicate/i.test(msg);
              if (isDuplicateSku && skuAttempt < 9) {
                sku = await nextSkuExclusive();
                continue;
              }
              insertError = error;
              break;
            }
            insertError = { message: "Insert fără răspuns." };
            break;
          }

          if (insertError || !inserted) {
            const msg = insertError?.message ?? "Eroare la creare produs.";
            const isDuplicateSlug =
              /duplicate key.*products_slug_key|products_slug_key|unique constraint.*slug/i.test(msg);
            const errText = isDuplicateSlug ? "Anunț deja adăugat (există deja acest anunț)." : msg;
            perRow[ctx.index] = { status: "failed", error: errText };
            failed.push({
              title: ctx.title,
              error: errText,
            });
            return;
          }

          const insertedId = inserted.id;
          createdIds.push(insertedId);
          perRow[ctx.index] = { status: "created", productId: insertedId };
          /* Imagini deja în R2 în `ctx.images` (mirror înainte de insert); nu folosim image_jobs aici. */
        })
      )
    );
  }

  const firstError = failed.length > 0 ? failed[0].error : null;
  const parts: string[] = [];
  if (createdIds.length > 0) parts.push(`${createdIds.length} create`);
  if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} duplicate omise`);
  if (failed.length > 0) parts.push(`${failed.length} erori`);
  const message =
    parts.length > 0
      ? `Import: ${parts.join(", ")}.${failed.length > 0 && firstError ? ` Prima eroare: ${firstError}` : ""}`
      : "Niciun produs de creat.";

  return {
    success: true,
    createdCount: createdIds.length,
    failedCount: failed.length,
    skippedDuplicates,
    createdIds,
    failed,
    message,
    errorDetail: firstError ?? undefined,
    perRow,
  };
}
