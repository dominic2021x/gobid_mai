/**
 * Entity extraction for semantic graph: reuse demand helpers + deterministic rules.
 * Optional LLM fallback cached in growth_audit_results (cap 200/run).
 */

import { normalizeQuery } from "@/lib/growth/demand/normalize";
import { detectCountySlug } from "@/lib/growth/demand/geo";
import { mapQueryToCategorySlug } from "@/lib/growth/demand/taxonomyMap";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { loadCounties } from "@/lib/growth/demand/geo";

export { normalizeQuery, detectCountySlug, mapQueryToCategorySlug };

export interface ExtractedNode {
  kind: string;
  slug: string;
  label: string;
  aliases?: string[];
  confidence?: number;
}

export interface EdgeCandidate {
  from: { kind: string; slug: string };
  to: { kind: string; slug: string };
  rel: string;
}

/** Known brand slugs (subset from category rules / autovehicule) for deterministic extraction */
const KNOWN_BRANDS = new Set([
  "dacia", "bmw", "mercedes", "audi", "vw", "volkswagen", "ford", "opel", "renault", "peugeot", "toyota", "hyundai",
]);

function slugFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

/**
 * Extract entities from text using deterministic rules (category, county, brand).
 * Returns nodes and edge candidates for graph upsert.
 */
export function extractEntitiesFromText(text: string): { nodes: ExtractedNode[]; edgeCandidates: EdgeCandidate[] } {
  const norm = normalizeQuery(text);
  if (!norm) return { nodes: [], edgeCandidates: [] };

  const nodes: ExtractedNode[] = [];
  const edgeCandidates: EdgeCandidate[] = [];
  const seen = new Set<string>();

  const addNode = (kind: string, slug: string, label: string, aliases?: string[]) => {
    const key = `${kind}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    nodes.push({ kind, slug, label, aliases, confidence: 1 });
  };

  const categorySlug = mapQueryToCategorySlug(norm);
  if (categorySlug && RO_CATEGORIES[categorySlug]) {
    const entry = RO_CATEGORIES[categorySlug];
    const label = typeof entry === "object" && entry !== null && "name" in entry ? (entry as { name: string }).name : categorySlug;
    addNode("category", categorySlug, label);
  }

  const countySlug = detectCountySlug(norm);
  if (countySlug) {
    const counties = loadCounties();
    const c = counties.find((x) => x.slug === countySlug);
    const label = c?.name ?? countySlug;
    addNode("county", countySlug, label);
  }

  const tokens = norm.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const slug = slugFromLabel(token);
    if (KNOWN_BRANDS.has(slug)) {
      const label = token.charAt(0).toUpperCase() + token.slice(1);
      addNode("brand", slug, label, [token]);
    }
  }

  if (countySlug && categorySlug) {
    edgeCandidates.push(
      { from: { kind: "county", slug: countySlug }, to: { kind: "category", slug: categorySlug }, rel: "in_category" }
    );
  }
  for (const n of nodes) {
    if (n.kind === "brand" && categorySlug) {
      edgeCandidates.push(
        { from: { kind: "brand", slug: n.slug }, to: { kind: "category", slug: categorySlug }, rel: "in_category" }
      );
    }
  }

  return { nodes, edgeCandidates };
}
