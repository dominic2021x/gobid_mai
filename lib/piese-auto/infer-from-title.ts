/**
 * Deducere Tip piesă + Marcă din titlu/descriere/specificații — același comportament ca la formularul manual (dashboard).
 * Folosit la import CSV admin / API.
 */

import { CAR_BRANDS_FULL } from "@/lib/data/brand-models";

/** Opțiuni „Tip piesă” pentru subcategoria Piese Auto (identic cu formularul manual). */
export const PIESE_AUTO_TIP_PIESA_OPTIONS: readonly string[] = [
  "Accesorii auto",
  "Accesorii roți",
  "Aprindere",
  "Cabluri auto",
  "Audio auto",
  "Caroserie",
  "Climatizare",
  "Dezmembrări",
  "Direcție",
  "Diverse",
  "Electrică auto",
  "Evacuare",
  "Faruri & lumini",
  "Filtre",
  "Frâne",
  "GPL",
  "Interior auto",
  "Întreținere",
  "Jante & anvelope",
  "GPS",
  "Revizie",
  "Moto",
  "Motor",
  "Injectoare",
  "Rulmenți",
  "Răcire",
  "Scule",
  "Suspensie",
  "Transmisie",
  "Tuning",
  "Turbo",
  "Uleiuri",
  "Xenon",
] as const;

export function normalizeRoText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?:;]+$/g, "")
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/ţ/g, "t")
    .replace(/\s+/g, " ");
}

/** Potrivește marca extrasă la o valoare din lista de branduri auto (dropdown). */
export function matchExtractedMarcaToBrandOption(extracted: string, options: readonly string[]): string | null {
  const raw = extracted.trim();
  if (!raw || options.length === 0) return null;
  const lower = raw.toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === lower);
  if (exact) return exact;

  const aliasToCanonical: Record<string, string[]> = {
    vw: ["Volkswagen"],
    volkswagen: ["Volkswagen"],
    vag: ["Volkswagen"],
    mercedes: ["Mercedes-Benz"],
    "mercedes-benz": ["Mercedes-Benz"],
    merc: ["Mercedes-Benz"],
    skoda: ["Škoda", "Skoda"],
    škoda: ["Škoda"],
    citroen: ["Citroën"],
    "citroën": ["Citroën"],
    alfa: ["Alfa Romeo"],
    "alfa romeo": ["Alfa Romeo"],
    "land rover": ["Land Rover"],
    mini: ["Mini"],
  };

  const tryAliases = aliasToCanonical[lower];
  if (tryAliases) {
    for (const target of tryAliases) {
      const m = options.find((o) => o.toLowerCase() === target.toLowerCase());
      if (m) return m;
    }
  }

  const tokenMatch = options.find(
    (o) =>
      o.length >= 2 &&
      (lower === o.toLowerCase() ||
        new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw))
  );
  if (tokenMatch) return tokenMatch;

  const fuzzy = options.find(
    (o) => o.length >= 3 && (lower.includes(o.toLowerCase()) || o.toLowerCase().includes(lower))
  );
  return fuzzy ?? null;
}

/**
 * Deduce „Tip piesă” din text normalizat (lower + fără diacritice) — aceleași scoruri ca în dashboard.
 */
export function detectTipPiesaFromNormalizedText(h: string, allowed: readonly string[]): string | null {
  const hay = h.trim();
  if (!hay || allowed.length === 0) return null;
  const ok = new Set(allowed);
  let bestScore = 0;
  let best: string | null = null;
  const consider = (label: string, score: number) => {
    if (!ok.has(label) || score <= 0) return;
    if (score > bestScore) {
      bestScore = score;
      best = label;
    }
  };

  consider("Injectoare", /\b(injector|injectoare|injectie|injectii|common\s*rail|rampa|duza|duze)\b/.test(hay) ? 122 : 0);
  consider("Turbo", /\b(turbo|turbina|turbosuflanta|wastegate|actuator\s*turbo|geometrie\s*variabila)\b/.test(hay) ? 120 : 0);
  consider("Xenon", /\b(xenon|balast\s*xenon|bec\s*xenon)\b/.test(hay) ? 118 : 0);
  consider("GPL", /\b(gpl|instalatie\s*gpl|rezervor\s*gpl|injectoare\s*gpl)\b/.test(hay) ? 118 : 0);
  consider("GPS", /\b(gps|navigatie|carplay|android\s*auto|harti)\b/.test(hay) ? 116 : 0);

  consider(
    "Evacuare",
    /\b(dpf|filtru\s*particule|particule|catalizator|egr|esapament|evacuare|teava\s*evacuare|toba)\b/.test(hay)
      ? 117
      : 0
  );

  consider(
    "Climatizare",
    /\b(climatizare|aer\s*conditionat|compresor\s*ac|radiator\s*ac|condensator\s*ac|evaporator|clapeta\s*ac|aeroterma|habitaclu\s*ac)\b/.test(hay)
      ? 114
      : 0
  );
  consider(
    "Răcire",
    /\b(radiator|termostat|pompa\s*apa|ventilator|racire|vas\s*expansiune|electroventilator|furtun\s*apa|conducta\s*apa)\b/.test(hay) &&
      !/\b(radiator\s*ac|compresor\s*ac|condensator\s*ac)\b/.test(hay)
      ? 108
      : 0
  );

  consider(
    "Filtre",
    /\b(filtru\s*(ulei|aer|motor|habitaclu|polen|combustibil)|filtre|filtru)\b/.test(hay) &&
      !/\b(filtru\s*particule|particule|dpf)\b/.test(hay)
      ? 106
      : 0
  );

  consider(
    "Electrică auto",
    /\b(alternator|ecu|senzor|releu|instalatie\s*electric|baterie\s*auto|mufa|comutator|demaror|electromotor|siguranta|modul\s*bcm|calculator)\b/.test(hay) ? 105 : 0
  );
  consider("Aprindere", /\b(bujie|bujii|bobina|aprindere|delco)\b/.test(hay) ? 105 : 0);
  consider("Cabluri auto", /\b(cablu|cablu\s*auto|fire\s*auto|fasung|mufa\s*auto)\b/.test(hay) ? 103 : 0);
  consider(
    "Audio auto",
    /\b(boxe\s*auto|subwoofer|statie|dvd\s*auto|amplificator\s*auto|audio\s*auto|casetofon|cd\s*player|unitate\s*multimedia)\b/.test(hay) ? 103 : 0
  );

  consider(
    "Faruri & lumini",
    /\b(far|faruri|stop|stopuri|proiector|halogen|lampa|lumini|semnal|semnalizare|angel\s*eyes|led\s*auto|tripla|ceata|drl)\b/.test(hay)
      ? 104
      : 0
  );

  consider("Frâne", /\b(frana|frane|disc\s*fr|etrier|placute|placuta|servofrana|abs|tambur|sabot|pompa\s*frana|conducta\s*frana)\b/.test(hay) ? 103 : 0);
  consider(
    "Suspensie",
    /\b(suspensie|amortizor|arc|trapez|silent\s*bloc|bieleta|pivot|flansa|telescop|bascula|bucsa|bara\s*stabilizatoare)\b/.test(hay) ? 102 : 0
  );
  consider(
    "Transmisie",
    /\b(transmisie|cutie\s*viteze|ambreiaj|cardan|diferential|planetara|reductor|volant|semiaxa|convertizor|mecatronic)\b/.test(hay) ? 102 : 0
  );

  consider(
    "Motor",
    /\b(bloc\s*motor|chiulasa|chiuloasa|arbore\s*cotit|piston|pistoane|segmenti|garnitura\s*chiulasa|distributie|biela|supapa|ax\s*cu\s*came|pompa\s*ulei)\b/.test(
      hay
    )
      ? 115
      : 0
  );
  const motorWord =
    /\bmotor\b/.test(hay) && !/\bmotorina\b/.test(hay) && !/\bmotocicleta\b/.test(hay) && !/\bmotociclete\b/.test(hay);
  consider("Motor", motorWord ? 99 : 0);

  consider("Moto", /\b(atv|quad|motocicleta|motociclete|scuter)\b/.test(hay) ? 112 : 0);
  consider("Moto", /\bmoto\b/.test(hay) && !/\bmotor\b/.test(hay) ? 90 : 0);

  consider(
    "Caroserie",
    /\b(caroserie|capota|aripa|bara|parbriz|spoiler|grila|portiera|geam|usa|usi|hayon|portbagaj|prag|lonjeron|trager|broasca\s*usa|macara\s*geam|oglinda)\b/.test(hay) ? 101 : 0
  );
  consider(
    "Interior auto",
    /\b(interior|scaun|scaune|volan|covoras|covor|bord|airbag|torpedou|plafon|husa|cotiera|maner\s*interior|consola|plansa\s*bord|nuca\s*schimbator)\b/.test(hay) ? 100 : 0
  );
  consider(
    "Jante & anvelope",
    /\b(janta|jante|anvelopa|anvelope|cauciuc|roata|roti|cauciucuri|set\s*roti)\b/.test(hay) ? 101 : 0
  );
  consider("Accesorii roți", /\b(capace\s*jante|accesorii\s*roti|prezoane|piulite\s*roti|distantiere|tpms)\b/.test(hay) ? 98 : 0);

  consider("Rulmenți", /\b(rulment|rulmenti)\b/.test(hay) ? 100 : 0);
  consider("Direcție", /\b(directie|servodirectie|caseta\s*directie|pompa\s*servo|cap\s*bara|bieleta\s*directie|coloana\s*volan)\b/.test(hay) ? 100 : 0);
  consider("Dezmembrări", /\b(dezmembrari|dezmembrez)\b/.test(hay) ? 97 : 0);

  consider("Revizie", /\b(revizie|kit\s*revizie)\b/.test(hay) ? 96 : 0);
  consider("Întreținere", /\b(intretinere|mentenanta|kit\s*intretinere|curatare\s*injectoare|solutie\s*parbriz)\b/.test(hay) ? 94 : 0);
  consider("Uleiuri", /\b(ulei\s*motor|uleiuri|ulei|lubrifiant|antigel|aditiv\s*ulei|lichid\s*frana|lichid\s*servo)\b/.test(hay) ? 93 : 0);

  consider("Tuning", /\b(tuning|body\s*kit|sport)\b/.test(hay) ? 92 : 0);
  consider("Scule", /\b(scule|cheie\s*dinamometrica|trusa\s*scule|extractor|tester\s*auto)\b/.test(hay) ? 88 : 0);

  consider("Diverse", /\b(diverse|alte\s*piese|altele|componenta|ansamblu|subansamblu)\b/.test(hay) ? 70 : 0);
  consider("Accesorii auto", /\b(accesorii\s*auto|accesorii\s*generale|suport\s*telefon|incarcator\s*auto|camera\s*bord)\b/.test(hay) ? 72 : 0);

  // Fallback pentru piese rare: dacă pare piesă auto dar nu avem match specific, completează minim „Diverse”.
  if (!best) {
    const genericAutoPart = /\b(piesa|piese|auto|autoturism|vehicul|stanga|dreapta|fata|spate)\b/.test(hay);
    if (genericAutoPart && ok.has("Diverse")) {
      return "Diverse";
    }
  }

  return best;
}

function detectBrandFromFullText(text: string): string | null {
  const brands = [...CAR_BRANDS_FULL].sort((a, b) => b.length - a.length);
  for (const b of brands) {
    if (b.length < 2) continue;
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      if (new RegExp(`\\b${esc}\\b`, "i").test(text)) return b;
    } catch {
      /* ignore */
    }
  }
  if (/\bMercedes\b/i.test(text)) {
    return matchExtractedMarcaToBrandOption("Mercedes", CAR_BRANDS_FULL);
  }
  if (/\bVW\b/i.test(text)) {
    return matchExtractedMarcaToBrandOption("VW", CAR_BRANDS_FULL);
  }
  return null;
}

/** Extrage un indiciu de marcă din linia „compatibil cu …” (ex. specificații CSV). */
function brandHintFromCompatibilityValue(value: string): string | null {
  const firstSeg = value.split(",")[0]?.trim() ?? "";
  if (!firstSeg) return null;
  const firstWord = firstSeg.split(/\s+/)[0] ?? "";
  if (firstWord.length >= 2) {
    const m = matchExtractedMarcaToBrandOption(firstWord, CAR_BRANDS_FULL);
    if (m) return m;
  }
  return matchExtractedMarcaToBrandOption(firstSeg, CAR_BRANDS_FULL);
}

/**
 * Condiție anunț (Nou / Second hand): standard **Second hand**, dacă în titlu/descriere/specificații
 * nu reiese clar că piesa este nouă (nou sigilat, nefolosit, produs nou, etc.).
 */
export function inferPieseAutoListingCondition(
  title: string,
  description: string,
  customOrSpec: Record<string, string>
): "Nou" | "Second hand" {
  const specValues = Object.values(customOrSpec || {}).join(" ");
  const combined = `${title}\n${description}\n${specValues}`;
  const t = normalizeRoText(combined.toLowerCase());

  if (
    /\b(second[\s-]?hand|secondhand|\bsh\b|uzat[aă]?|folosit[aă]?|defect|dezmembrari|dezmembrez|pentru\s+reparatie)\b/.test(
      t
    )
  ) {
    return "Second hand";
  }

  const explicitNou =
    /\b(nou\s*sigilat|nefolosit|nedesfacut|produs\s+nou|piesa\s+noua|piese\s+noi|stare\s+nou|oem\s+nou|nou\s+in\s+ambalaj|in\s+folie\s+originala)\b/.test(
      t
    ) || /\b(noua|nou)\s*[,;]?\s*(sigilat|nefolosit|oem|in\s+folie)\b/.test(t);

  if (explicitNou) return "Nou";

  const titleTrim = title.trim();
  if (/^(nou|noua|nouă)\b/i.test(titleTrim)) return "Nou";

  return "Second hand";
}

/**
 * Completează brand, tip piesă, category_level_3 și marca pentru import — ca la anunțul manual.
 */
export function enrichPieseAutoImportMetadata(args: {
  title: string;
  description: string;
  specifications: Record<string, string>;
}): {
  brand: string | null;
  marca: string | null;
  tipPiesa: string | null;
  categoryLevel3: string | null;
} {
  const specText = Object.entries(args.specifications)
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  const fullRaw = `${args.title} ${args.description} ${specText}`;
  const textNorm = normalizeRoText(fullRaw.toLowerCase());

  let tipPiesa = detectTipPiesaFromNormalizedText(textNorm, PIESE_AUTO_TIP_PIESA_OPTIONS);

  let brand: string | null = null;
  const compatKey = Object.keys(args.specifications).find((k) => /compatibil/i.test(k));
  if (compatKey && args.specifications[compatKey]) {
    brand = brandHintFromCompatibilityValue(args.specifications[compatKey]);
  }
  if (!brand) {
    brand = detectBrandFromFullText(fullRaw);
  }
  if (brand) {
    brand = matchExtractedMarcaToBrandOption(brand, CAR_BRANDS_FULL) ?? brand;
  }

  return {
    brand,
    marca: brand,
    tipPiesa,
    categoryLevel3: tipPiesa,
  };
}
