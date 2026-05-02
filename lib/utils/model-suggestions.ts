/**
 * Utilități pentru sugestii de modele apropiate (iPhone 14 → 13, 15, 12 etc.)
 * Funcționează pe baza datelor din DB + heuristici simple (fără API extern).
 */

import { slugify } from '@/lib/slugify';

/** Normalizează text pentru comparare (lowercase, fără diacritice) */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** Generează cheie slug din label (ex: "iPhone 13 Pro Max" → "iphone-13-pro-max") */
export function modelKeyFromLabel(label: string): string {
  if (!label || typeof label !== 'string') return '';
  return slugify(label);
}

/**
 * Extrage numărul principal din label (ex: "iPhone 14 Pro" → 14, "Seria 3" → 3)
 * Returnează null dacă nu găsește un număr potrivit.
 */
export function extractPrimaryNumber(label: string): number | null {
  if (!label || typeof label !== 'string') return null;
  const normalized = normalizeText(label);
  // Numere 1-2 cifre (ex: 14, 3, 16) sau 3-4 cifre pentru ani (ex: 2020)
  const match = normalized.match(/\b(1\d{2}|20\d{2}|[1-9]\d?)\b/);
  if (match) {
    const n = parseInt(match[1], 10);
    // Exclude ani ca număr de model dacă sunt 4 cifre (ex: 2020) - opțional, puteți include
    if (n >= 1900 && n <= 2030) return n; // an
    if (n >= 1 && n <= 99) return n;
    if (n >= 100 && n <= 999) return n; // ex: Seria 320
  }
  const shortNum = normalized.match(/\b(\d{1,2})\b/);
  return shortNum ? parseInt(shortNum[1], 10) : null;
}

/**
 * Extrage "familia" modelului (primele 1-2 tokenuri): iphone, galaxy s, redmi note, seria
 * Folosit pentru a prefera modele din aceeași familie.
 */
export function extractFamily(label: string): string {
  if (!label || typeof label !== 'string') return '';
  const normalized = normalizeText(label);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  // Primele 1-2 cuvinte (ex: "iphone", "galaxy s", "redmi note")
  const family = tokens.slice(0, 2).join(' ');
  return family;
}

/**
 * Similaritate Jaccard pe tokenuri (0-1)
 */
function tokenOverlapScore(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(/\s+/).filter(Boolean));
  const setB = new Set(normalizeText(b).split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Distanță Levenshtein simplă (pentru fallback)
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const dp: number[][] = Array(an + 1).fill(null).map(() => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) dp[i][0] = i;
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[an][bn];
}

export interface ModelCandidate {
  label: string;
  key: string;
  number: number | null;
  family: string;
}

export interface ScoredModel {
  label: string;
  key: string;
  score: number;
}

/**
 * Calculează scor de similaritate între model_query și un candidat din DB.
 * A) Același family → bonus
 * B) Dacă ambele au număr → preferă distanță numerică mică
 * C) Fallback: similaritate text (Jaccard / overlap)
 */
export function scoreModelMatch(
  modelQuery: string,
  candidate: ModelCandidate
): number {
  const qNorm = normalizeText(modelQuery);
  const qFamily = extractFamily(modelQuery);
  const qNumber = extractPrimaryNumber(modelQuery);

  let score = 0;

  // A) Potrivire familie (prefix)
  if (qFamily && candidate.family) {
    const qF = qFamily.split(' ')[0];
    const cF = candidate.family.split(' ')[0];
    if (qF === cF || candidate.family.startsWith(qF) || qFamily.startsWith(cF)) {
      score += 40;
    }
    // overlap pe familie
    if (candidate.label.toLowerCase().includes(qF) || qNorm.includes(cF)) {
      score += 20;
    }
  }

  // B) Distanță numerică
  if (qNumber !== null && candidate.number !== null) {
    const diff = Math.abs(qNumber - candidate.number);
    if (diff === 0) score += 50;
    else if (diff === 1) score += 35;
    else if (diff === 2) score += 20;
    else if (diff <= 5) score += 10;
  }

  // C) Similaritate text (fallback)
  const textScore = tokenOverlapScore(modelQuery, candidate.label) * 30;
  score += textScore;

  // Bonus pentru substring (ex: query "iphone 14" și candidat "iPhone 14 Pro")
  if (candidate.label.toLowerCase().includes(qNorm) || qNorm.includes(candidate.label.toLowerCase())) {
    score += 15;
  }

  return score;
}

/**
 * Sortează și filtrează candidații după model_query; returnează top N.
 */
export function rankModelSuggestions(
  modelQuery: string,
  candidates: ModelCandidate[],
  topN: number = 8
): ScoredModel[] {
  if (!modelQuery || !candidates.length) return [];
  const qNorm = normalizeText(modelQuery);
  const scored: ScoredModel[] = candidates.map((c) => ({
    label: c.label,
    key: c.key,
    score: scoreModelMatch(modelQuery, c),
  }));
  // Exclude exact match (user îl caută deja)
  const filtered = scored.filter((s) => normalizeText(s.label) !== qNorm);
  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, topN);
}

/**
 * Extrage label de model dintr-un produs (custom_fields sau title).
 */
export function getModelLabelFromProduct(product: {
  custom_fields?: Record<string, unknown>;
  title?: string;
}): string | null {
  const cf = product.custom_fields as Record<string, unknown> | undefined;
  const label =
    (cf?.model_label as string) ??
    (cf?.model as string) ??
    (cf?.Model as string) ??
    null;
  if (label && typeof label === 'string') return label.trim();
  // Fallback: nu extragem din title automat (prea zgomot); API-ul poate trimite titlul ca sursă
  return null;
}
