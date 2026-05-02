/**
 * Universal pattern engine – constants and limits.
 * Deterministic, serverless-safe.
 */

/** Max suggestions to return after pattern filtering + ranking. */
export const PATTERN_SUGGEST_TOP_K = 10;

/** Max candidates to run through pattern matching (before top-K). */
export const PATTERN_CANDIDATE_CAP = 80;

/** Min phrase length (chars) to consider. */
export const MIN_PHRASE_LENGTH = 2;

/** Max phrase length (chars) – reject overly long. */
export const MAX_PHRASE_LENGTH = 120;

/** Min pattern confidence to accept (0..1). */
export const MIN_PATTERN_CONFIDENCE = 0.3;

/** Score multiplier for preferred pattern types. */
export const PREFERRED_PATTERN_BOOST = 1.2;

/** Penalty multiplier for invalid / weak patterns. */
export const INVALID_PATTERN_PENALTY = 0;

/** Default min pattern score per profile (can override). */
export const DEFAULT_MIN_PATTERN_SCORE = 0.4;
