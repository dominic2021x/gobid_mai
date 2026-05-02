/**
 * Builds searchable text from vision query in a deterministic way
 */

import { VisionProductQuery } from './types';

/**
 * Builds a stable, searchable text string from vision query JSON
 * This text will be embedded for vector search
 */
export function buildSearchableText(query: VisionProductQuery): string {
  const parts: string[] = [];

  // Caption (most important)
  if (query.caption) {
    parts.push(query.caption);
  }

  // Attributes
  if (query.attributes.category) {
    parts.push(`Categorie: ${query.attributes.category}`);
  }
  if (query.attributes.brand) {
    parts.push(`Brand: ${query.attributes.brand}`);
  }
  if (query.attributes.color) {
    parts.push(`Culoare: ${query.attributes.color}`);
  }
  if (query.attributes.material) {
    parts.push(`Material: ${query.attributes.material}`);
  }
  if (query.attributes.pattern) {
    parts.push(`Pattern: ${query.attributes.pattern}`);
  }
  if (query.attributes.gender) {
    parts.push(`Gen: ${query.attributes.gender}`);
  }
  if (query.attributes.key_details && query.attributes.key_details.length > 0) {
    parts.push(`Detalii: ${query.attributes.key_details.join(', ')}`);
  }

  // Identifiers (high priority)
  if (query.identifiers.model_code) {
    parts.push(`Model: ${query.identifiers.model_code}`);
  }
  if (query.identifiers.sku_text) {
    parts.push(`SKU: ${query.identifiers.sku_text}`);
  }
  if (query.identifiers.visible_text) {
    parts.push(`Text vizibil: ${query.identifiers.visible_text}`);
  }

  return parts.join('. ').trim();
}
