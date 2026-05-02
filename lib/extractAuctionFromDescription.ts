/**
 * auctionExtractor.ts
 *
 * Extrage data/ora/adresa pentru licitații din text/HTML.
 * Suportă:
 *  - one-off (o dată explicită, "va avea loc pe 06.02.2026, la ora 11:00")
 *  - listă de date + oră comună (", în datele de 30.01.2026, 06.02.2026 ... , ora 15.00")
 *  - rolling daily ("în fiecare zi"/"în orice zi") + interval orar ("între orele 8:30 și 16:00")
 *  - rolling weekly ("în fiecare vineri, la ora 10:30") → calculează următoarea apariție (dacă azi e sâmbătă, pune vinerea viitoare)
 *  - ignoră intervalele de depunere oferte ("Perioada de depunere ... 05.02.2026 - 05.03.2026") ca dată licitație
 *
 * NOTĂ: Dacă vrei “când sunt mai multe date => alege cea mai departe”, setează PICK_POLICY = "max".
 *       Dacă vrei “următoarea dată >= azi, altfel max”, setează PICK_POLICY = "nextOrMax".
 */

export type PickPolicy = "max" | "nextOrMax";
const PICK_POLICY: PickPolicy = "max";

/** util */
function trimText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** strip HTML */
function stripHtml(htmlOrText: string): string {
  return htmlOrText.replace(/<[^>]+>/g, " ");
}

/** normalize (pentru matching) */
function normalizeForMatching(htmlOrText: string): string {
  return stripHtml(htmlOrText)
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ş/g, "ș")
    .replace(/ţ/g, "ț");
}

/** y-m-d validity (fără “31 februarie” -> 2 martie) */
function isValidYMD(year: number, month0: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month0, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month0 &&
    d.getUTCDate() === day
  );
}

/**
 * Convertește o dată dd/mm/yyyy sau dd-mm-yyyy sau dd.mm.yyyy în ISO (YYYY-MM-DD), fără shift de fus orar.
 */
export function parseDateToISO(dateStr: string): string | null {
  const trimmed = trimText(dateStr);
  const m = trimmed.match(/^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month0 = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);

  if (month0 < 0 || month0 > 11 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  if (!isValidYMD(year, month0, day)) return null;

  const d = new Date(Date.UTC(year, month0, day));
  return d.toISOString().slice(0, 10);
}

function clampTime(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nowLocalISODate(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickMaxIso(dates: string[]): string | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  return sorted[sorted.length - 1] ?? null;
}

function pickNextOrMaxIso(dates: string[], nowIso: string): string | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  const next = sorted.find((d) => d >= nowIso);
  return next ?? sorted[sorted.length - 1] ?? null;
}

function pickDateByPolicy(dates: string[], nowIso: string): string | null {
  if (PICK_POLICY === "max") return pickMaxIso(dates);
  return pickNextOrMaxIso(dates, nowIso);
}

/** weekday mapping */
const WEEKDAY_MAP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  "duminică": 0,
  "duminica": 0,
  "luni": 1,
  "marți": 2,
  "marti": 2,
  "miercuri": 3,
  "joi": 4,
  "vineri": 5,
  "sâmbătă": 6,
  "sambata": 6,
};

/**
 * Următoarea zi din săptămână (target: 0=dum .. 6=sâm) calculată din ziua din curs (now).
 * Ex: azi 07.02.2026 (sâmbătă) + „în fiecare miercuri” → 11.02.2026.
 */
export function nextWeekdayISO(now: Date, target: 0 | 1 | 2 | 3 | 4 | 5 | 6): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const cur = d.getDay(); // 0..6
  let add = (target - cur + 7) % 7;
  if (add === 0) add = 7; // dacă e azi aceeași zi, următoarea apariție e săptămâna viitoare
  d.setDate(d.getDate() + add);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Adaugă n zile la o dată ISO (YYYY-MM-DD), returnează ISO. */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ExtractedAuction {
  /** Data în format ISO YYYY-MM-DD (pentru one-off sau “următoarea apariție” calculată) */
  dateIso: string | null;
  /** Ora start ca "HH:MM" */
  time: string | null;
  /** Ora final (pentru intervale), "HH:MM" */
  timeEnd?: string | null;
  /** Adresă extrasă (dacă există) */
  address: string | null;

  /** “În orice zi” / “în fiecare zi” */
  rollingDaily?: boolean;

  /** “în fiecare vineri” etc */
  rollingWeekly?: {
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  };

  /** Când e rolling weekly și există „prima licitație pe [dată] … se repetă săptămânal”: a doua dată = prima + 7 zile */
  dateIso2?: string | null;
}

/** regex-uri */
const DATE_RE = /(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/g;

// time: 8:30 / 08.30 / 15.00 / 10:30
const TIME_RE = /\b(\d{1,2})[.:](\d{2})(?::(\d{2}))?\b/g;

// „în fiecare zi” / „se desfășoară în fiecare zi” (\\b nu funcționează pentru „î”, folosim (?:^|\\s))
const DAILY_RE = new RegExp(
  "(?:^|[\\s,])(în|in)\\s*fiecare\\s*zi(?!\\s+de\\s+(?:luni|mar[tț]i|marti|miercuri|joi|vineri|sâmbătă|sambata|duminic[ăa]|duminica))|(?:^|[\\s,])(în|in)\\s*orice\\s*zi|\\bzilnic\\b",
  "i"
);
// „între orele 8:30 și 16:00” (\\b nu funcționează pentru „î”)
const BETWEEN_HOURS_RE =
  /(?:^|\s)între\s+orele\s+(\d{1,2})[.:](\d{2})\s+(?:și|si)\s+(\d{1,2})[.:](\d{2})\b/i;

const WEEKDAY_ALT =
  "(luni|mar[tț]i|marti|miercuri|joi|vineri|sâmbătă|sambata|duminic[ăa]|duminica)";
// “în fiecare vineri” sau “în fiecare zi de luni” (\\b nu funcționează în JS pentru „î”, folosim (?:^|\\s))
const WEEKLY_RE = new RegExp(
  "(?:^|[\\s,])(în|in)\\s*fiecare\\s+(?:zi\\s+de\\s+)?" + WEEKDAY_ALT + "\\b",
  "i"
);
// fallback: „săptămânal … zi(de) de luni” / „în zilele de joi” (zilele = zi+le+le; fiecare joi fără „de”)
const WEEKLY_SAPTAMANAL_RE = new RegExp(
  "(?:zi(?:le){1,2}\\s+de\\s+|fiecare\\s+)" + WEEKDAY_ALT + "\\b",
  "i"
);
const SAPTAMANAL_HINT_RE = /săptămânal|saptamanal/i;

// context oră
const CONTEXT_TIME_RE =
  /(?:\bora\b|\borele\b|\bla\s+ora\b|\bîncepe\b|\bdeschidere\b|\blicita(?:t[ie]e|ție|ţie)\b)\s*[:\-]?\s*(\d{1,2})[.:](\d{2})/i;

// interval depunere oferte
const RANGE_RE =
  /\b(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})\s*[-–]\s*(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})\b/;
const OFFERS_CONTEXT_RE =
  /\b(perioada\s+de\s+depunere|depunere(a)?\s+ofertelor|ofertele\s+pot\s+fi\s+depuse)\b/i;

function isOfferSubmissionRange(textNormalized: string): boolean {
  return OFFERS_CONTEXT_RE.test(textNormalized) && RANGE_RE.test(textNormalized);
}

function extractAllIsoDates(text: string): string[] {
  const all: string[] = [];
  DATE_RE.lastIndex = 0; // reset global regex
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(text)) !== null) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (y < 2020 || y > 2035 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const iso = parseDateToISO(`${m[1]}/${m[2]}/${m[3]}`);
    if (iso) all.push(iso);
  }
  return all;
}

/**
 * Extrage data explicită a „primei licitații” din fraze de tip:
 * „Prima licitație va avea loc pe 29.01.2026, la ora 15:00”
 * „Prima licitație pe 29.01.2026 … Licitațiile ulterioare se vor desfășura săptămânal, în zilele de joi”
 * Returnează data în ISO (YYYY-MM-DD) sau null dacă nu găsește.
 */
function extractFirstAuctionDateExplicit(text: string): string | null {
  const normalized = normalizeForMatching(text);
  // „prima licitație (va avea loc)? pe DD.MM.YYYY” sau „primul ... pe ...”
  const firstAuctionRe = new RegExp(
    "(?:prima|primul)\\s+licita(?:tie|ția|țiile|ție)\\s+(?:va\\s+avea\\s+loc\\s+)?pe\\s+(\\d{1,2})[\\/\\-.\s](\\d{1,2})[\\/\\-.\s](\\d{4})",
    "i"
  );
  const m = normalized.match(firstAuctionRe);
  if (m) {
    const iso = parseDateToISO(`${m[1]}/${m[2]}/${m[3]}`);
    if (iso) return iso;
  }
  // „începând cu data de 14.01.2026” / „începând cu 14.01.2026” (licitații în fiecare zi de miercuri, începând cu ...)
  const incepandRe = /începând\s+cu\s+(?:data\s+de\s+)?(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/i;
  const mIncepand = normalized.match(incepandRe);
  if (mIncepand) {
    const iso = parseDateToISO(`${mIncepand[1]}/${mIncepand[2]}/${mIncepand[3]}`);
    if (iso) return iso;
  }

  // Fallback: „va avea loc pe DD.MM.YYYY” când există și „săptămânal” (prima apariție = prima licitație)
  if (SAPTAMANAL_HINT_RE.test(normalized)) {
    const vaAveaLocRe = /va\s+avea\s+loc\s+pe\s+(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/i;
    const m2 = normalized.match(vaAveaLocRe);
    if (m2) {
      const iso = parseDateToISO(`${m2[1]}/${m2[2]}/${m2[3]}`);
      if (iso) return iso;
    }
  }
  return null;
}

function extractTimeContextFirst(text: string): string | null {
  const m = text.match(CONTEXT_TIME_RE);
  if (!m) return null;
  return clampTime(parseInt(m[1], 10), parseInt(m[2], 10));
}

/** fallback: ia “cea mai bună” oră, evitând intervalele */
function extractBestTime(textRaw: string, textNormalized: string): string | null {
  const ctx = extractTimeContextFirst(textRaw);
  if (ctx) return ctx;

  TIME_RE.lastIndex = 0;
  let best: { t: string; score: number } | null = null;

  let mt: RegExpExecArray | null;
  while ((mt = TIME_RE.exec(textRaw)) !== null) {
    const t = clampTime(parseInt(mt[1], 10), parseInt(mt[2], 10));
    if (!t) continue;

    const left = Math.max(0, mt.index - 70);
    const right = Math.min(textNormalized.length, mt.index + mt[0].length + 70);
    const window = textNormalized.slice(left, right);

    let score = 0;

    // dacă e interval "între orele X și Y" penalizează
    if (/\bîntre\s+orele\b/.test(window)) score -= 40;

    // bonus dacă apare “ora / la ora / licita”
    if (/\bora\b|\bla\s+ora\b|\bîncepe\b|\bdeschidere\b|\blicita/.test(window)) score += 25;

    // bonus mic dacă e "ora 15.00" (punctuație după)
    if (/(?:\bora\b|\bla\s+ora\b).{0,8}\b\d{1,2}[.:]\d{2}\b/.test(window)) score += 10;

    if (!best || score > best.score) best = { t, score };
  }

  return best?.t ?? null;
}

function extractDailyInterval(textNormalized: string): { start: string | null; end: string | null } {
  const m = textNormalized.match(BETWEEN_HOURS_RE);
  if (!m) return { start: null, end: null };
  const start = clampTime(parseInt(m[1], 10), parseInt(m[2], 10));
  const end = clampTime(parseInt(m[3], 10), parseInt(m[4], 10));
  return { start, end };
}

function extractWeeklyWeekday(textNormalized: string): (0 | 1 | 2 | 3 | 4 | 5 | 6) | null {
  const m = textNormalized.match(WEEKLY_RE);
  if (m) {
    const weekdayName = m[2]; // grup 1 = (în|in), grup 2 = ziua
    return WEEKDAY_MAP[weekdayName.toLowerCase()] ?? null;
  }
  // fallback: „săptămânal … zi de luni” (sau „fiecare luni”) când nu e prins de WEEKLY_RE
  if (SAPTAMANAL_HINT_RE.test(textNormalized)) {
    const m2 = textNormalized.match(WEEKLY_SAPTAMANAL_RE);
    if (m2) return WEEKDAY_MAP[m2[1].toLowerCase()] ?? null;
  }
  return null;
}

/** adresă: păstrează raw, acceptă virgule; taie la separatori mari */
function extractAddress(rawText: string): string | null {
  const m =
    rawText.match(/(?:adresa|la\s*sediul|sediul)\s*[:\-]?\s*([^\n;]{10,350})/i) ||
    rawText.match(/(?:localitatea|localitate)\s*[:\-]?\s*([^\n;]{2,120})/i) ||
    rawText.match(/(Romania\s*,\s*[^\n;]{5,200})/i);

  if (!m) return null;

  let addr = trimText(m[1]);

  // taie dacă după adresă intră în altă propoziție tip “în data … / la ora …”
  addr = addr.replace(/\s+(?:în\s+data|la\s+data|pe\s+\d{1,2}[\/\-.\s]\d{1,2}[\/\-.\s]\d{4}|ora\b|orele\b).*$/i, "");
  addr = trimText(addr);

  if (addr.length < 8) return null;
  return addr.slice(0, 300);
}

/**
 * Extrage din text/HTML: data licitației, ora, opțional adresa + rolling daily/weekly.
 */
export function extractAuctionDateAndTimeFromText(
  htmlOrText: string,
  now: Date = new Date()
): ExtractedAuction {
  const result: ExtractedAuction = { dateIso: null, time: null, address: null, timeEnd: null };

  const rawText = trimText(stripHtml(htmlOrText).replace(/\s+/g, " "));
  if (!rawText) return result;

  const normalized = normalizeForMatching(rawText);

  // adresa (pe raw)
  result.address = extractAddress(rawText);

  // 1) rolling weekly – verificăm ÎNAINTE de daily ca „în fiecare zi de miercuri” să fie mereu săptămânal, nu zilnic
  const weekday = extractWeeklyWeekday(normalized);
  if (weekday !== null) {
    result.rollingWeekly = { weekday };

    // ora (ex: „ora 12.00” din text)
    result.time = extractBestTime(rawText, normalized);

    // „În fiecare miercuri” / „în fiecare joi” etc.: data = următoarea zi din săptămână din ZIUA DIN CURS (now), nu din text
    result.dateIso = nextWeekdayISO(now, weekday);
    result.dateIso2 = addDays(result.dateIso, 7);
    return result;
  }

  // 2) rolling daily (doar când nu e „în fiecare zi de [luni|...|miercuri|...]”)
  if (DAILY_RE.test(normalized)) {
    result.rollingDaily = true;
    const interval = extractDailyInterval(normalized);
    if (interval.start) result.time = interval.start;
    if (interval.end) result.timeEnd = interval.end;
    return result;
  }

  // 3) ignoră “perioadă depunere oferte” ca dată licitație (dar tot putem extrage adresă)
  const ignoreOfferRange = isOfferSubmissionRange(normalized);

  // 4) one-off / listă de date
  const allDates = ignoreOfferRange ? [] : extractAllIsoDates(rawText);
  const nowIso = nowLocalISODate(now);

  if (allDates.length) {
    result.dateIso = pickDateByPolicy(allDates, nowIso);
  } else {
    // Nicio dată în descriere: punem data la 1 an de acum (evită „licitație încheiată” fără informație reală)
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    result.dateIso = nowLocalISODate(oneYearFromNow);
  }

  // ora: context first, apoi fallback robust
  result.time = extractBestTime(rawText, normalized);

  return result;
}

/**
 * Combină data ISO (YYYY-MM-DD) cu ora (HH:MM) într-un singur string ISO pentru DB.
 * Pentru rollingDaily/rollingWeekly, de regulă combini pe baza dateIso calculat (ex: next Friday),
 * sau calculezi la runtime la afișare.
 */
export function combineDateAndTime(dateIso: string | null, time: string | null): string | null {
  if (!dateIso) return null;
  if (!time) return dateIso;

  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return dateIso;

  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return dateIso;

  return `${dateIso}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
}
