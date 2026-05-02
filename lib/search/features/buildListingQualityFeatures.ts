/**
 * Listing quality features: title, images, completeness, freshness, spam penalty.
 */

import type { ListingQualityFeatures } from "../ranking/core/types";
import { FRESHNESS_HALF_DAYS } from "../ranking/core/constants";

const MIN_TITLE_LENGTH = 10;
const GOOD_TITLE_LENGTH = 30;
const MIN_IMAGES = 1;
const GOOD_IMAGES = 3;
const SPAM_PATTERNS = [/^vand\s/i, /^oferta\s/i, /!!!+$/, /\b(urgent|gratuit|free)\b/gi];

export function buildListingQualityFeatures(item: Record<string, unknown> | null): ListingQualityFeatures {
  if (!item) {
    return {
      titleQuality: 0.5,
      imageCount: 0,
      imageQualityProxy: 0,
      fieldCompleteness: 0.5,
      freshness: 0.5,
      spamPenalty: 1,
    };
  }

  const title = String(item.title ?? "").trim();
  const titleLen = title.length;
  let titleQuality = 0.5;
  if (titleLen >= GOOD_TITLE_LENGTH) titleQuality = 1;
  else if (titleLen >= MIN_TITLE_LENGTH) titleQuality = 0.5 + 0.5 * (titleLen - MIN_TITLE_LENGTH) / (GOOD_TITLE_LENGTH - MIN_TITLE_LENGTH);
  else if (titleLen > 0) titleQuality = 0.3;

  const images = item.images as string[] | null | undefined;
  const imageCount = Array.isArray(images) ? images.length : 0;
  const imageQualityProxy = imageCount >= GOOD_IMAGES ? 1 : imageCount >= MIN_IMAGES ? 0.5 + 0.5 * imageCount / GOOD_IMAGES : 0;

  let fieldCompleteness = 0.5;
  const hasDesc = !!item.description && String(item.description).length > 20;
  const hasPrice = item.price != null || (item.price_text && String(item.price_text).length > 0);
  const hasCategory = !!(item.category ?? item.categorie);
  if (hasDesc) fieldCompleteness += 0.2;
  if (hasPrice) fieldCompleteness += 0.2;
  if (hasCategory) fieldCompleteness += 0.1;
  fieldCompleteness = Math.min(1, fieldCompleteness);

  const createdAt = item.created_at as string | null | undefined;
  const days = createdAt
    ? (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
    : 365;
  const freshness = Math.exp(-(days * Math.LN2) / FRESHNESS_HALF_DAYS);

  let spamPenalty = 1;
  for (const re of SPAM_PATTERNS) {
    if (re.test(title)) {
      spamPenalty *= 0.9;
      break;
    }
  }

  return {
    titleQuality,
    imageCount,
    imageQualityProxy,
    fieldCompleteness,
    freshness: Math.min(1, freshness),
    spamPenalty,
  };
}
