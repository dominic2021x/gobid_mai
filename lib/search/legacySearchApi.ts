/**
 * Fallback după FTS filtrat în `/api/search`: motorul existent `searchProducts`
 * (FTS fără filtre + ILIKE în SupabaseSearchEngine) → RAG → sugestii.
 */

import { retrieveContext } from "@/lib/ai/rag";
import { supabaseAdmin } from "@/lib/supabase";
import { searchProducts } from "@/lib/search";
import type { SearchResult } from "@/lib/search/types";

export interface LegacySearchBody {
  query?: string;
  limit?: number;
  filters?: {
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
  };
  voice?: boolean;
}

export type LegacySearchHit = {
  id: string;
  title: string;
  description: string;
  category?: string;
  price?: number;
  image?: string;
  url: string;
  score: number;
  type?: string;
  brand?: string;
  isSuggestion?: boolean;
  suggestionLabel?: string;
};

async function generateSuggestions(query: string): Promise<LegacySearchHit[]> {
  const suggestions: LegacySearchHit[] = [];

  if (!supabaseAdmin) {
    return [];
  }

  try {
    const lowerQuery = query.toLowerCase();
    const yearMatch = lowerQuery.match(/\b(19|20)\d{2}\b/);
    const detectedYear = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const queryWithoutYear = lowerQuery.replace(/\b(19|20)\d{2}\b/g, "").trim();

    if (detectedYear) {
      const years: number[] = [];
      for (let i = detectedYear - 5; i <= detectedYear + 5; i++) {
        if (i >= 1990 && i <= 2035 && i !== detectedYear) years.push(i);
      }
      for (const year of years.slice(0, 10)) {
        const variantQuery = `${queryWithoutYear} ${year}`.trim();
        const variantResults = await retrieveContext(variantQuery, undefined, 3);
        if (variantResults.length > 0) {
          suggestions.push(
            ...variantResults.map((result) => ({
              id: result.id,
              title: result.metadata?.title || result.text.substring(0, 100),
              description: result.metadata?.description || result.text,
              category: result.metadata?.category || result.metadata?.subcategory || undefined,
              price: result.metadata?.price || undefined,
              image: result.metadata?.image || undefined,
              url: result.metadata?.url || result.source,
              score: result.score * 0.8,
              type: result.type,
              brand: result.metadata?.brand || undefined,
              isSuggestion: true,
              suggestionLabel: `Similar: ${variantQuery}`,
            })),
          );
        }
      }
    }

    if (suggestions.length === 0 && queryWithoutYear) {
      const similarResults = await retrieveContext(queryWithoutYear, undefined, 10);
      if (similarResults.length > 0) {
        suggestions.push(
          ...similarResults.map((result) => ({
            id: result.id,
            title: result.metadata?.title || result.text.substring(0, 100),
            description: result.metadata?.description || result.text,
            category: result.metadata?.category || result.metadata?.subcategory || undefined,
            price: result.metadata?.price || undefined,
            image: result.metadata?.image || undefined,
            url: result.metadata?.url || result.source,
            score: result.score * 0.7,
            type: result.type,
            brand: result.metadata?.brand || undefined,
            isSuggestion: true,
            suggestionLabel: "Te-ar putea interesa",
          })),
        );
      }
    }

    if (suggestions.length === 0 && supabaseAdmin) {
      const keywords = queryWithoutYear.split(/\s+/).filter((w) => w.length > 2);
      if (keywords.length > 0) {
        const firstKeyword = keywords[0];
        const searchPattern = `title.ilike.%${firstKeyword}%,description.ilike.%${firstKeyword}%,category.ilike.%${firstKeyword}%,subcategory.ilike.%${firstKeyword}%`;
        const { data: products, error: productsError } = await supabaseAdmin
          .from("products")
          .select("id, title, description, images, starting_price_ron, category, subcategory, url, slug")
          .or(searchPattern)
          .or("status.eq.active,approval_status.eq.approved")
          .not("title", "is", null)
          .not("description", "is", null)
          .limit(10);

        if (!productsError && products && products.length > 0) {
          suggestions.push(
            ...products.map((p: Record<string, unknown>) => {
              const imgs = p.images as unknown[] | undefined;
              const imageUrl =
                Array.isArray(imgs) && imgs.length > 0
                  ? typeof imgs[0] === "string"
                    ? imgs[0]
                    : (imgs[0] as { url?: string })?.url
                  : undefined;
              const slug = p.slug as string | undefined;
              const url =
                (p.url as string) || (slug ? `/licitatii-publice/${slug}` : `/licitatii-publice/${String(p.id)}`);
              return {
                id: String(p.id),
                title: String(p.title ?? ""),
                description: String(p.description ?? ""),
                category: (p.category as string) || (p.subcategory as string),
                price: p.starting_price_ron as number | undefined,
                image: imageUrl,
                url,
                score: 0.5,
                type: "product",
                isSuggestion: true,
                suggestionLabel: "Te-ar putea interesa",
              };
            }),
          );
        }
      }
    }

    return suggestions
      .filter((s, index, self) => index === self.findIndex((t) => t.id === s.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  } catch (e) {
    console.error("[legacySearch] generateSuggestions", e);
    return [];
  }
}

/**
 * Same pipeline as pre-FTS `/api/search` POST (no FTS).
 */
export async function runLegacySearch(body: LegacySearchBody): Promise<{
  results: LegacySearchHit[];
  total: number;
  query: string;
  hasSuggestions: boolean;
}> {
  const query = body.query?.trim() ?? "";
  if (!query) {
    return { results: [], total: 0, query: "", hasSuggestions: false };
  }

  const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

  function mapEngineToLegacy(r: SearchResult): LegacySearchHit {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      price: r.price,
      image: r.image,
      url: r.url || "",
      score: r.score,
      type: r.type,
      brand: r.metadata?.brand as string | undefined,
    };
  }

  let searchResults: Array<{
    id: string;
    text: string;
    source: string;
    type: string;
    metadata?: Record<string, unknown>;
    score: number;
  }> = [];

  try {
    const engineHits = await searchProducts(query, limit);
    if (engineHits.length > 0) {
      return {
        results: engineHits.map(mapEngineToLegacy),
        total: engineHits.length,
        query,
        hasSuggestions: false,
      };
    }

    try {
      const contextResults = await retrieveContext(query, undefined, limit);
      if (contextResults?.length) searchResults = contextResults as typeof searchResults;
    } catch (e) {
      console.error("[legacySearch] retrieveContext", e);
    }
  } catch (searchError) {
    console.error("[legacySearch]", searchError);
    try {
      searchResults = (await retrieveContext(query, undefined, limit)) as typeof searchResults;
    } catch {
      searchResults = [];
    }
  }

  const results: LegacySearchHit[] = searchResults.map((result) => ({
    id: result.id,
    title: (result.metadata?.title as string) || result.text.substring(0, 100),
    description: (result.metadata?.description as string) || result.text,
    category: (result.metadata?.category as string) || (result.metadata?.subcategory as string) || undefined,
    price: result.metadata?.price as number | undefined,
    image: result.metadata?.image as string | undefined,
    url: (result.metadata?.url as string) || result.source,
    score: result.score,
    type: result.type,
    brand: result.metadata?.brand as string | undefined,
  }));

  let suggestions: LegacySearchHit[] = [];
  if (results.length === 0) {
    suggestions = await generateSuggestions(query);
  }

  const out = results.length > 0 ? results : suggestions;
  return {
    results: out,
    total: out.length,
    query,
    hasSuggestions: results.length === 0 && suggestions.length > 0,
  };
}
