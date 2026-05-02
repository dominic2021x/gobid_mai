/**
 * Supply gap quality scoring.
 * Thresholds: demand_7d>=50, ctr_7d>=0.03, pogo_rate<=0.35, supply<=30.
 * Flags: low_ctr, high_pogo, ambiguous (q_norm<4 or missing county/category when relevant).
 */

export interface GapRow {
  q_norm: string;
  category_slug: string | null;
  county_slug: string | null;
  search_demand: number;
  listing_supply: number;
}

export interface QueryStats {
  ctr_7d: number;
  pogo_rate: number;
}

const DEMAND_MIN = 50;
const CTR_MIN = 0.03;
const POGO_RATE_MAX = 0.35;
const SUPPLY_MAX = 30;
const Q_NORM_MIN_LENGTH = 4;

export type QualityFlag = "low_ctr" | "high_pogo" | "low_demand" | "high_supply" | "ambiguous";

export interface ScoreResult {
  quality_score: number;
  flags: QualityFlag[];
}

/**
 * Score a gap for quality. Returns quality_score (0-4) and flags.
 * Gate: block if quality_score < 1 OR flags include low_ctr | high_pogo | ambiguous.
 */
export function scoreGap(
  gapRow: GapRow,
  queryStats: QueryStats | null
): ScoreResult {
  const flags: QualityFlag[] = [];
  const demand = gapRow.search_demand;
  const supply = gapRow.listing_supply;
  const ctr = queryStats?.ctr_7d ?? 0;
  const pogoRate = queryStats?.pogo_rate ?? 0;

  let quality_score = 0;
  if (demand >= DEMAND_MIN) {
    quality_score += 1;
  } else {
    flags.push("low_demand");
  }
  if (ctr >= CTR_MIN) {
    quality_score += 1;
  } else {
    flags.push("low_ctr");
  }
  if (pogoRate <= POGO_RATE_MAX) {
    quality_score += 1;
  } else {
    flags.push("high_pogo");
  }
  if (supply <= SUPPLY_MAX) {
    quality_score += 1;
  } else {
    flags.push("high_supply");
  }

  const qNorm = String(gapRow.q_norm ?? "").trim();
  if (qNorm.length < Q_NORM_MIN_LENGTH) {
    flags.push("ambiguous");
  }

  return { quality_score, flags };
}

/** Check if the gap passes the create-landing quality gate. */
export function passesCreateLandingGate(result: ScoreResult): boolean {
  if (result.quality_score < 1) return false;
  const blockingFlags: QualityFlag[] = ["low_ctr", "high_pogo", "ambiguous"];
  return !blockingFlags.some((f) => result.flags.includes(f));
}
