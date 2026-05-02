/**
 * HTML → text pentru descrieri: `""` din CSV, `<br …>` cu atribute (OLX), apoi strip tag-uri.
 * Heuristici extra (Compatibil cu •, X6Se, cod+La) doar în `normalizePieseAutoCsvDescription`.
 */

function decodeHtmlEntitiesForPlainTextOnce(input: string): string {
  let s = input;
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, "\u0022");
  s = s.replace(/&#(\d+);/g, (full, n) => {
    const code = Number(n);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
  });
  s = s.replace(/&#x([0-9a-f]+);/gi, (full, h) => {
    const code = parseInt(h, 16);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
  });
  s = s.replace(/&amp;/g, "&");
  return s;
}

/** Mai multe nivele &amp;lt;br&amp;gt; → <br> după repetări. */
function decodeHtmlEntitiesIteratively(input: string, maxPass = 8): string {
  let s = input;
  for (let i = 0; i < maxPass; i++) {
    const next = decodeHtmlEntitiesForPlainTextOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

export function htmlDescriptionToPlainText(raw: string): string {
  let s = String(raw ?? "");
  // CSV/Excel în câmp: "" → " — altfel tag-uri gen <span style=""color..."> nu se închid corect la strip.
  for (let p = 0; p < 6 && s.includes('""'); p++) s = s.replace(/""/g, '"');
  s = decodeHtmlEntitiesIteratively(s);

  // Încă escapat în sursă — și <br ...> cu atribute (entity-encoded)
  s = s.replace(/&lt;br\b[\s\S]*?&gt;/gi, "\n");
  s = s.replace(/&lt;\s*\/\s*p\s*&gt;/gi, "\n");
  s = s.replace(/&lt;\s*\/\s*div\s*&gt;/gi, "\n");

  if (!s.includes("<")) {
    return s;
  }

  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // OLX: <br style="..."> — nu doar <br> gol (altfel rândurile se lipesc)
  s = s.replace(/<\s*br\b[^>]*>/gi, "\n");
  s = s.replace(/<\s*li\s*>/gi, "\n• ");
  s = s.replace(/<\s*\/\s*li\s*>/gi, "\n");
  s = s.replace(/<\s*\/?\s*ul\s*>/gi, "\n");
  s = s.replace(/<\s*\/?\s*ol\s*>/gi, "\n");
  s = s.replace(/<\/\s*p\s*>/gi, "\n");
  s = s.replace(/<\/\s*div\s*>/gi, "\n");
  s = s.replace(/<\/\s*h[1-6]\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  return decodeHtmlEntitiesForPlainTextOnce(s);
}

/** Linie din lista „Compatibil cu” (OLX / BMW): serie + interval sau SUV X5/X6. */
function looksLikeVehicleCompatLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (/^[•\-*‧]\s/.test(trimmed)) return true;
  if (/\(\s*\d{2}\/\d{4}\s*[—\-–]\s*\d{2}\/\d{4}\s*\)/.test(trimmed)) return true;
  if (/^[457]'\s*F/i.test(trimmed)) return true;
  if (/^X[5678]\s/i.test(trimmed)) return true;
  if (/Gran\s+Coup/i.test(trimmed)) return true;
  if (/^\d'\s/.test(trimmed)) return true;
  return false;
}

/** După „Compatibil cu:”, prefixează cu • ca în preview-ul OLX (dacă lipsește). */
function formatCompatibilCuBulletLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let compat = false;

  for (const line of lines) {
    const t = line.trim();
    if (/^compatibil\s+cu:?\s*$/i.test(t)) {
      compat = true;
      out.push(t.endsWith(":") ? t : `${t}:`);
      continue;
    }
    if (compat) {
      if (!t) {
        compat = false;
        out.push("");
        continue;
      }
      if (!looksLikeVehicleCompatLine(t)) {
        compat = false;
        out.push(line);
        continue;
      }
      out.push(/^[•\-*‧]\s/.test(t) ? t : `• ${t}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Text „lipit” când lipsește complet HTML-ul sau &lt;br&gt; nu a fost decodat corect:
 * după interval închis urmează direct următorul model; X6 lipit de „Se”; etc.
 */
function insertNewlinesForFusedImportText(s: string): string {
  let x = s;
  // Fără spațiu între serie SUV și „Se poate …” → „X6Se” (cea mai frecventă greșeală sus în descriere)
  x = x.replace(/\b(X[56])(Se\s+poate\b)/gi, "$1\n\n$2");
  x = x.replace(/\b(demontare)(Compatibil\s+cu\b)/gi, "$1\n\n$2");
  // Două SUV pe același rând: „X5 E70 X6 E71” → două linii (ca în sursa OLX cu <br> între span-uri)
  x = x.replace(/\b(X[5678]\s+E\d{2})\s+(X[5678]\s+E\d{2})\b/gi, "$1\n$2");
  // „Compatibil cu:5'” sau „cu:Se” (fără spațiu după :)
  x = x.replace(/(compatibil\s+cu:)(\S)/gi, "$1\n$2");
  // Închidere interval „06/2012)” urmată direct de „5'” / „7'” / „X5” (listă OLX)
  x = x.replace(/\)(\s*)(?=[457]'|X[567]\b)/g, ")\n");
  // Variante cu spațiu normal între cuvinte
  x = x.replace(/\b(X[56])\s+(Se\s+poate\b)/gi, "$1\n\n$2");
  x = x.replace(/\b(demontare)\s+(Compatibil\s+cu\b)/gi, "$1\n\n$2");
  x = x.replace(/([.!?])\s*(Se\s+poate\b)/gi, "$1\n\n$2");
  // Un singur \n între randă gen „… X5 X6” și „Se poate…” → același aer ca două <br> în OLX
  x = x.replace(/\b(X[56])\n(Se\s+poate\b)/gi, "$1\n\n$2");
  x = x.replace(/\n(Compatibil\s+cu:)/gi, "\n\n$1");
  // „cod: 8570675La cerere …” lipit după cod (un import / copiere)
  x = x.replace(/(cod:\s*\d+)\s*(La\s+)/gi, "$1\n\n$2");
  x = x.replace(/(cod:\s*\d+)(La\b)/gi, "$1\n\n$2");
  return x;
}

function normalizeDescriptionCommonTail(s: string, h: string): string {
  let x = s
    .replace(new RegExp(`${h}*#\\d+${h}*\\.?${h}*$`), "")
    .replace(new RegExp(`${h}*ID${h}*#\\d+${h}*`, "gi"), " ")
    .replace(new RegExp(`${h}*#\\d+${h}*`, "g"), " ");
  x = x
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return x;
}

/**
 * Descriere pe /live_bid — toate produsele: HTML → text, curățare #id, fără heuristici OLX/CSV.
 * Important: nu folosi `\s` lângă `#123`: în JS `\s` include `\n` și poate șterge rânduri întregi.
 */
export function normalizeLiveBidDescriptionDisplay(raw: string): string {
  const h = "[^\\S\\n\\r]";
  let s = htmlDescriptionToPlainText(String(raw ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/<\s*br\b[^>]*>/gi, "\n");
  s = normalizeDescriptionCommonTail(s, h);
  return s.trim();
}

/**
 * Doar import CSV piese auto (admin/dashboard): lipiri OLX, „Compatibil cu” cu • (+ același HTML→text ca mai sus).
 */
export function normalizePieseAutoCsvDescription(raw: string): string {
  const h = "[^\\S\\n\\r]";
  let s = htmlDescriptionToPlainText(String(raw ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/<\s*br\b[^>]*>/gi, "\n");
  s = insertNewlinesForFusedImportText(s);
  s = normalizeDescriptionCommonTail(s, h);
  s = formatCompatibilCuBulletLines(s);
  return s.trim();
}

/** Excel/export: încă un strat `"..."` în jurul HTML după parsare — scoatem o singură dată. */
export function stripOuterCsvQuotesIfAny(raw: string): string {
  const s = String(raw ?? "").trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"').trim();
  }
  return s;
}

/**
 * **Singurul punct de intrare** pentru descrierea din CSV la import piese auto:
 * orice număr de paragrafe (1…N), HTML cu `<span>` / `<br style=…>` / ghilimele `""`, text simplu — același șablon.
 */
export function normalizePieseAutoDescriptionImportCell(raw: string): string {
  return normalizePieseAutoCsvDescription(stripOuterCsvQuotesIfAny(raw));
}
