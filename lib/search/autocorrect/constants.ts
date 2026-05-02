/**
 * Autocorrect constants: safe, bounded, deterministic.
 */

/** Min token length to consider for typo correction (avoid correcting "ap", "2"). */
export const MIN_TOKEN_LENGTH_FOR_TYPO = 3;

/** Max Levenshtein distance for a correction (1 = single char add/remove/replace). */
export const MAX_EDIT_DISTANCE = 2;

/** Max candidates to generate per token (bounded for serverless). */
export const MAX_CANDIDATES_PER_TOKEN = 8;

/** Min confidence (0..1) to return corrected query in result. */
export const MIN_CONFIDENCE_TO_APPLY = 0.75;

/** Min confidence to add didYouMean in suggest response. */
export const MIN_CONFIDENCE_DID_YOU_MEAN = 0.85;

/** Min confidence to run internal fallback search with corrected query (v2 zero-results). */
export const MIN_CONFIDENCE_FALLBACK = 0.85;

/** Tokens we never correct (numbers, codes, short). */
export const NEVER_CORRECT_PATTERN = /^\d+$|^[a-z]{1,2}$/i;

/** Max query length to run autocorrect (avoid heavy work on long pastes). */
export const MAX_QUERY_LENGTH_AUTOCORRECT = 80;
