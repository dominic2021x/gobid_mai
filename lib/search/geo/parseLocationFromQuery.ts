/**
 * Parse location intent from search query: county and/or place (city/town/commune/village).
 * Uses token matching and optional DB lookup; supports ambiguous names (returns first match or ambiguous flag).
 */

import type { ParsedLocation, GeoPlaceType } from "./types";
import { normalizeLocation } from "./normalizeLocation";
import { MIN_LOCATION_TOKEN_LEN } from "./constants";

export type CountyRecord = { id: string; code: string; name: string; name_norm: string };
export type PlaceRecord = { id: string; county_id: string; name_norm: string; type: GeoPlaceType };

/**
 * Resolver: given normalized county code/slug and optional place name_norm, return county id and place id.
 * Return null for countyId/placeId when not found. When multiple places match (same name in different counties), return ambiguous.
 */
export type GeoResolver = (params: {
  countyCodeNorm: string | null;
  placeNameNorm: string | null;
}) => Promise<{
  countyId: string | null;
  placeId: string | null;
  placeType: GeoPlaceType | null;
  ambiguous: boolean;
}>;

/**
 * Parse query text into location tokens and resolve against counties/places.
 * - Splits query into tokens, normalizes each.
 * - Tries to match last token(s) as place name (multi-word: "Alba Iulia", "Baia Mare").
 * - Tries to match a token as county (code or name_norm).
 * - Calls resolver(countyCodeNorm, placeNameNorm) when resolver provided.
 */
export async function parseLocationFromQuery(
  queryNorm: string,
  resolver?: GeoResolver | null
): Promise<ParsedLocation> {
  const tokens = queryNorm.split(/\s+/).filter((t) => t.length >= MIN_LOCATION_TOKEN_LEN);
  const matchedTokens: string[] = [];
  let countyCode: string | null = null;
  let placeNameNorm: string | null = null;

  if (tokens.length === 0) {
    return {
      countyCode: null,
      countyId: null,
      placeNameNorm: null,
      placeId: null,
      placeType: null,
      matchedTokens: [],
      ambiguous: false,
    };
  }

  // Try last 1–3 tokens as place name (longest first: "Baia de Aries" then "Baia" etc.)
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const start = tokens.length - len;
    if (start < 0) continue;
    const candidate = tokens.slice(start, start + len).join(" ");
    if (candidate.length >= 2) {
      placeNameNorm = candidate;
      for (let i = start; i < start + len; i++) matchedTokens.push(tokens[i]);
      break;
    }
  }

  // Any remaining token might be county (e.g. "teren intravilan Dolj" -> county Dolj)
  for (let i = 0; i < tokens.length; i++) {
    if (matchedTokens.includes(tokens[i])) continue;
    const t = tokens[i];
    if (t.length >= 2) {
      countyCode = t;
      if (!matchedTokens.includes(t)) matchedTokens.push(t);
      break;
    }
  }

  // If we only had one token, treat as county or place (resolver will disambiguate)
  if (tokens.length === 1 && !countyCode && !placeNameNorm) {
    placeNameNorm = tokens[0];
    countyCode = tokens[0];
    matchedTokens.push(tokens[0]);
  }

  if (!resolver) {
    return {
      countyCode: countyCode ?? null,
      countyId: null,
      placeNameNorm: placeNameNorm ?? null,
      placeId: null,
      placeType: null,
      matchedTokens: [...new Set(matchedTokens)],
      ambiguous: false,
    };
  }

  const countyCodeNorm = countyCode ? normalizeLocation(countyCode) : null;
  const placeNorm = placeNameNorm ? normalizeLocation(placeNameNorm) : null;
  const resolved = await resolver({
    countyCodeNorm: countyCodeNorm || null,
    placeNameNorm: placeNorm || null,
  });

  const outCountyCode = countyCode ?? (resolved.countyId && placeNameNorm ? placeNameNorm : null);

  return {
    countyCode: outCountyCode ?? null,
    countyId: resolved.countyId ?? null,
    placeNameNorm: placeNameNorm ?? null,
    placeId: resolved.placeId ?? null,
    placeType: resolved.placeType ?? null,
    matchedTokens: [...new Set(matchedTokens)],
    ambiguous: resolved.ambiguous,
  };
}

/**
 * Synchronous parse: only extracts tokens and inferred county/place name norms; no DB.
 * Use when resolver is not available (e.g. client-side preview).
 */
export function parseLocationFromQuerySync(queryNorm: string): {
  countyCodeNorm: string | null;
  placeNameNorm: string | null;
  matchedTokens: string[];
} {
  const tokens = queryNorm.split(/\s+/).filter((t) => t.length >= MIN_LOCATION_TOKEN_LEN);
  const matchedTokens: string[] = [];
  let countyCodeNorm: string | null = null;
  let placeNameNorm: string | null = null;

  if (tokens.length === 0) {
    return { countyCodeNorm: null, placeNameNorm: null, matchedTokens: [] };
  }

  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const start = tokens.length - len;
    if (start < 0) continue;
    const candidate = tokens.slice(start, start + len).join(" ");
    if (candidate.length >= 2) {
      placeNameNorm = normalizeLocation(candidate);
      for (let i = start; i < start + len; i++) matchedTokens.push(tokens[i]);
      break;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (matchedTokens.includes(tokens[i])) continue;
    if (tokens[i].length >= 2) {
      countyCodeNorm = normalizeLocation(tokens[i]);
      matchedTokens.push(tokens[i]);
      break;
    }
  }

  if (tokens.length === 1) {
    placeNameNorm = placeNameNorm ?? normalizeLocation(tokens[0]);
    countyCodeNorm = countyCodeNorm ?? normalizeLocation(tokens[0]);
    if (matchedTokens.length === 0) matchedTokens.push(tokens[0]);
  }

  return {
    countyCodeNorm,
    placeNameNorm,
    matchedTokens: [...new Set(matchedTokens)],
  };
}
