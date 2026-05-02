/**
 * Progressive token steps: core (1–2 meaningful tokens), then +refiners.
 * Cap suggestion phrases to max 3 tokens. If any step yields 0 results, stop (termsReduced=true).
 */

import { tokenize, RO_STOPWORDS } from './normalize';

const MAX_TOKENS_SUGGESTION = 3;

/**
 * Build progressive steps: [core], [core+refiner1], [core+refiner2], ... capped at MAX_TOKENS_SUGGESTION.
 * core = first 1–2 meaningful (non-stopword) tokens; refiners = rest.
 */
export function buildProgressiveSteps(query: string): string[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const meaningful = tokens.filter((t) => !RO_STOPWORDS.has(t.toLowerCase()));
  if (meaningful.length === 0) return [tokens.slice(0, MAX_TOKENS_SUGGESTION).join(' ')];

  const core = meaningful.slice(0, 2).join(' ');
  const refiners = meaningful.slice(2);
  const steps: string[] = [core];
  let acc = core;
  for (const r of refiners) {
    if (steps.length >= MAX_TOKENS_SUGGESTION) break;
    acc = `${acc} ${r}`.trim();
    if (acc && !steps.includes(acc)) steps.push(acc);
  }
  return steps.slice(0, MAX_TOKENS_SUGGESTION);
}

/**
 * Build steps for search (can be more than 3 for internal ladder).
 * First step = best (most specific), last = core only or brand only.
 */
export function buildTokenStepsForSearch(query: string): string[] {
  const steps = buildProgressiveSteps(query);
  if (steps.length === 0) return [];
  const tokens = tokenize(query);
  if (tokens.length > 0 && steps[steps.length - 1] !== tokens[0]) {
    steps.push(tokens[0]);
  }
  return [...new Set(steps)];
}

export { MAX_TOKENS_SUGGESTION };
