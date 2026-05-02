/**
 * Autocorectare pentru textul de căutare RO: cuvinte scrise fără spațiu (ex. „usastanga” → „usa stanga”).
 * Lucrează pe string deja ASCII / lowercase (după stripDiacritics).
 */

import { stripDiacritics } from "@/lib/search/normalize";

/** Mapări explicite — chei fără spații, lowercase ASCII. */
const RUN_TOGETHER_EXPLICIT: Record<string, string> = {
  usastanga: "usa stanga",
  usadreapta: "usa dreapta",
  usafata: "usa fata",
  usaspate: "usa spate",
  barafata: "bara fata",
  baraspate: "bara spate",
  farstanga: "far stanga",
  fardreapta: "far dreapta",
  geamfata: "geam fata",
  geamdreapta: "geam dreapta",
  geamstanga: "geam stanga",
  geamspate: "geam spate",
  oglindastanga: "oglinda stanga",
  oglindadreapta: "oglinda dreapta",
  aripastanga: "aripa stanga",
  aripadreapta: "aripa dreapta",
  amortizorfata: "amortizor fata",
  amortizorspate: "amortizor spate",
  planetarastanga: "planetara stanga",
  planetaradreapta: "planetara dreapta",
};

/**
 * Cuvinte scurte comune piese-auto / direcții — folosite doar la segmentare greedy
 * pentru tokeni lungi, fără spațiu (minim 8 caractere ca să evităm despărțiri false).
 */
const GREEDY_WORDS = new Set<string>([
  "usa",
  "stanga",
  "dreapta",
  "fata",
  "spate",
  "bara",
  "motor",
  "capota",
  "haion",
  "parbriz",
  "geam",
  "oglinda",
  "oglinzi",
  "far",
  "faruri",
  "aripa",
  "pavilion",
  "torpedou",
  "amortizor",
  "radiator",
  "intercooler",
  "turbo",
  "injector",
  "pompa",
  "filtru",
  "ulei",
  "ambreiaj",
  "volanta",
  "planetara",
  "cardan",
  "disc",
  "tambur",
  "placute",
  "etrier",
  "rulment",
  "bucsa",
  "articulatie",
  "lonjeron",
  "prag",
  "maneta",
  "macara",
  "broasca",
  "balama",
  "bara",
]);

const MIN_GREEDY_TOKEN_LEN = 8;
const MIN_PART_LEN = 3;
const MAX_PART_LEN = 16;

function tryGreedySplit(token: string): string | null {
  if (token.length < MIN_GREEDY_TOKEN_LEN) return null;

  const parts: string[] = [];
  let i = 0;
  while (i < token.length) {
    let found: string | null = null;
    const upper = Math.min(MAX_PART_LEN, token.length - i);
    for (let len = upper; len >= MIN_PART_LEN; len--) {
      const slice = token.slice(i, i + len);
      if (GREEDY_WORDS.has(slice)) {
        found = slice;
        break;
      }
    }
    if (!found) return null;
    parts.push(found);
    i += found.length;
  }
  if (parts.length < 2) return null;
  return parts.join(" ");
}

/**
 * Corectează un singur token (fără spații în interior).
 */
export function autocorrectSearchToken(token: string): string {
  const t = token.trim().toLowerCase();
  if (!t || /\s/.test(t)) return token;

  const explicit = RUN_TOGETHER_EXPLICIT[t];
  if (explicit) return explicit;

  const greedy = tryGreedySplit(t);
  if (greedy) return greedy;

  return token;
}

/**
 * Aplică autocorectare pe întreg query-ul (tokeni separați prin spații).
 */
export function autocorrectRoSearchQ(asciiLowerCollapsed: string): string {
  const s = asciiLowerCollapsed.trim().replace(/\s+/g, " ");
  if (!s) return "";

  const pieces = s.split(" ").map((w) => autocorrectSearchToken(w));
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Normalizare completă pentru parametrul `q` la listări: spații, diacritice eliminate, autocorectare lipiri.
 */
export function normalizeListingsSearchQText(raw: string, maxLen: number): string {
  const collapsed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!collapsed) return "";
  const ascii = stripDiacritics(collapsed).trim() || collapsed;
  return autocorrectRoSearchQ(ascii).slice(0, maxLen).trim();
}
