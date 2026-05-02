/**
 * Parsează text CSV (UTF-8, cu ghilimele RFC-style) în rânduri pentru import piese auto.
 * Header-uri acceptate (case-insensitive, diacritice normalizate): titlu/title, url, pret/price, etc.
 */

import type { PieseAutoImportInputRow } from "@/lib/piese-auto/import-products-core";
import { stripOuterCsvQuotesIfAny } from "@/lib/live-bid/description-plain-text";

/** Elimină BOM și normalizează diacritice comune în ASCII pentru potrivire header. */
function normKey(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function detectDelimiter(firstLine: string): "," | ";" {
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

/** Parse CSV simplu: suportă câmpuri între ghilimele; delimiter `,` sau `;` (detectat pe prima linie). */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  const firstNl = s.search(/\r?\n/);
  const firstLine = firstNl === -1 ? s : s.slice(0, firstNl);
  const delim = detectDelimiter(firstLine);

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

const TITLE_KEYS = new Set(["titlu", "title", "nume", "name", "produs", "denumire", "anunt"]);
const URL_KEYS = new Set(["url", "link"]);
const PRICE_KEYS = new Set(["pret", "price", "preț"]);
const DESC_KEYS = new Set(["descriere", "description", "desc", "detalii"]);
const EXT_KEYS = new Set(["id_extern", "external_id", "cod", "id_piesa", "pieseauto_id"]);
const IMAGE_KEYS = new Set(["imagine", "image", "poza"]);
const IMAGES_KEYS = new Set(["imagini", "image_urls", "images", "poze", "galerie"]);
const LOC_KEYS = new Set(["locatie", "locație", "location", "oras", "oraș"]);
const LIVR_KEYS = new Set(["livrare", "livrare_si_plata", "livraresiplata", "plata"]);
const SPEC_JSON_KEYS = new Set([
  "specifications_json",
  "spec_json",
  "specificatii_json",
  "specificatii",
  "specificații",
]);

/** Stare produs în CSV (opțional): gol → la import devine Uzat din oficiu. */
const CONDITION_KEYS = new Set([
  "stare",
  "condition",
  "conditie",
  "conditie_produs",
  "stare_produs",
]);

function parseSpecificationsJsonFlexible(raw: string): Record<string, string> | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const attempts = [t, t.replace(/^"|"$/g, ""), t.replace(/""/g, '"')];
  for (const a of attempts) {
    try {
      const p = JSON.parse(a) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
          if (v != null) out[k] = String(v);
        }
        return Object.keys(out).length ? out : undefined;
      }
    } catch {
      /* next */
    }
  }
  return undefined;
}

function mapHeaderToCanonical(h: string): string | null {
  const k = normKey(h);
  if (TITLE_KEYS.has(k)) return "title";
  if (URL_KEYS.has(k)) return "url";
  if (PRICE_KEYS.has(k)) return "price";
  if (DESC_KEYS.has(k)) return "description";
  if (EXT_KEYS.has(k)) return "externalId";
  if (IMAGE_KEYS.has(k)) return "image";
  if (IMAGES_KEYS.has(k)) return "imageUrlsRaw";
  if (LOC_KEYS.has(k)) return "location";
  if (LIVR_KEYS.has(k)) return "livrareSiPlata";
  if (SPEC_JSON_KEYS.has(k)) return "specifications_json";
  if (CONDITION_KEYS.has(k)) return "conditionCsv";
  return null;
}

function splitImageList(raw: string): string[] {
  return raw
    .split(/[|;,\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));
}

/**
 * Convertește conținut CSV în lista de produse pentru import.
 * Prima linie = header. Rândurile goale sunt ignorate.
 */
export function parsePieseAutoCsvToProducts(csvText: string): PieseAutoImportInputRow[] {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) return [];

  const headerCells = rows[0].map((c) => c.trim());
  const colMap: Array<string | null> = headerCells.map((h) => mapHeaderToCanonical(h));

  const out: PieseAutoImportInputRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rec: Record<string, string> = {};
    for (let c = 0; c < headerCells.length; c++) {
      const canon = colMap[c];
      if (!canon) continue;
      let val = (cells[c] ?? "").trim();
      if (canon === "description") val = stripOuterCsvQuotesIfAny(val);
      if (val) rec[canon] = val;
    }

    const title = rec.title ?? "";
    const url = rec.url ?? "";
    const imageUrlsRaw = rec.imageUrlsRaw ?? "";
    const image = rec.image ?? "";
    const imageUrls = splitImageList(imageUrlsRaw);

    let specifications: Record<string, string> | undefined;
    if (rec.specifications_json) {
      specifications = parseSpecificationsJsonFlexible(rec.specifications_json);
    }

    const row: PieseAutoImportInputRow = {
      title,
      description: rec.description,
      price: rec.price,
      image: image || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      livrareSiPlata: rec.livrareSiPlata,
      externalId: rec.externalId || null,
      location: rec.location || null,
      url: url || undefined,
      specifications,
      ...(rec.conditionCsv ? { conditionCsv: rec.conditionCsv } : {}),
    };

    const hasSomething =
      title.length > 0 ||
      (url && url.length > 0) ||
      (image && image.length > 0) ||
      imageUrls.length > 0 ||
      (rec.price && rec.price.length > 0);
    if (!hasSomething) continue;

    out.push(row);
  }

  return out;
}
