/**
 * Diversify: max 3 consecutive same category, max 5 consecutive same county.
 * When disableCountyDiversification (e.g. county in intent), only category diversification applies.
 */

import type { SearchCandidate } from "./types";

const MAX_CONSECUTIVE_CATEGORY = 3;
const MAX_CONSECUTIVE_COUNTY = 5;

export interface DiversifyOptions {
  disableCountyDiversification?: boolean;
}

export function diversify(
  candidates: SearchCandidate[],
  options?: DiversifyOptions
): SearchCandidate[] {
  const result: SearchCandidate[] = [];
  let remaining = [...candidates];
  let lastCat = "";
  let lastCounty = "";
  let catRun = 0;
  let countyRun = 0;
  const noCountyDiversify = options?.disableCountyDiversification === true;

  while (remaining.length > 0) {
    const allowed = (c: SearchCandidate) => {
      const cCat = (c.category ?? "").trim() || "_";
      const cCounty = (c.county ?? "").trim() || "_";
      const okCat = cCat !== lastCat || catRun < MAX_CONSECUTIVE_CATEGORY;
      const okCounty = noCountyDiversify || cCounty !== lastCounty || countyRun < MAX_CONSECUTIVE_COUNTY;
      return okCat && okCounty;
    };
    const idx = remaining.findIndex(allowed);
    const pick = idx >= 0 ? remaining[idx] : remaining[0];
    if (idx >= 0) remaining.splice(idx, 1);
    else remaining.shift();
    result.push(pick);
    const pCat = (pick.category ?? "").trim() || "_";
    const pCounty = (pick.county ?? "").trim() || "_";
    if (pCat === lastCat) catRun++;
    else {
      lastCat = pCat;
      catRun = 1;
    }
    if (pCounty === lastCounty) countyRun++;
    else {
      lastCounty = pCounty;
      countyRun = 1;
    }
  }

  return result;
}
