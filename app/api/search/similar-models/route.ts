import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  modelKeyFromLabel,
  extractPrimaryNumber,
  extractFamily,
  rankModelSuggestions,
  type ModelCandidate,
} from '@/lib/utils/model-suggestions';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

/** Normalizează pentru match (lowercase, fără diacritice) */
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * GET /api/search/similar-models?category_path=...&brand_key=...&model_query=...
 * category_path = category sau "category/subcategory" (ex: electronice, electronice/telefoane)
 * brand_key = brand normalizat (ex: Apple, BMW) – se potrivește cu custom_fields.marca, custom_fields.brand sau title
 * model_query = query-ul utilizatorului (ex: iphone 14)
 *
 * Returnează modele existente în DB pentru acel brand + categorie, ordonate după apropiere de model_query.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryPath = (searchParams.get('category_path') ?? '').trim();
    const brandKey = (searchParams.get('brand_key') ?? '').trim();
    const modelQuery = (searchParams.get('model_query') ?? '').trim();

    if (!categoryPath || !brandKey || !modelQuery) {
      return Response.json(
        { error: 'Missing category_path, brand_key or model_query', suggestions: [] },
        { status: 400 }
      );
    }

    const [category, subcategory] = categoryPath.split('/').map((s) => s.trim().toLowerCase());
    if (!category) {
      return Response.json(
        { error: 'Invalid category_path', suggestions: [] },
        { status: 400 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return Response.json(
        { error: 'Server configuration error', suggestions: [] },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Încarcă produse: category (și opțional subcategory), status active/reserved
    let qb = supabase
      .from('products')
      .select('id, title, category, subcategory, custom_fields')
      .in('status', ['active', 'reserved'])
      .not('title', 'is', null);

    qb = qb.ilike('category', category);
    if (subcategory) {
      qb = qb.ilike('subcategory', subcategory);
    }

    const { data: products, error } = await qb.limit(500);

    if (error) {
      console.error('[similar-models] Supabase error:', error);
      return Response.json(
        { error: error.message, suggestions: [] },
        { status: 500 }
      );
    }

    const brandNorm = norm(brandKey);
    const modelLabelsSet = new Set<string>();

    for (const p of products || []) {
      const cf = (p as any).custom_fields as Record<string, unknown> | undefined;
      const pBrand =
        (cf?.marca as string) ??
        (cf?.brand as string) ??
        (cf?.Brand as string) ??
        (p as any).brand ??
        '';
      const title = ((p as any).title ?? '') as string;
      const brandMatch =
        norm(String(pBrand)) === brandNorm ||
        norm(title).includes(brandNorm) ||
        (brandNorm.length >= 2 && norm(String(pBrand)).includes(brandNorm));
      if (!brandMatch) continue;

      const modelLabel =
        (cf?.model_label as string) ??
        (cf?.model as string) ??
        (cf?.Model as string) ??
        null;
      if (modelLabel && typeof modelLabel === 'string') {
        const label = modelLabel.trim();
        if (label.length >= 2) modelLabelsSet.add(label);
      }
      // Fallback: extrage din titlu un posibil model (ex: "iPhone 13 Pro Max" din titlu)
      if (!modelLabel && title) {
        const trimmed = title.trim();
        if (trimmed.length >= 3) modelLabelsSet.add(trimmed);
      }
    }

    const candidates: ModelCandidate[] = [];
    for (const label of modelLabelsSet) {
      candidates.push({
        label,
        key: modelKeyFromLabel(label),
        number: extractPrimaryNumber(label),
        family: extractFamily(label),
      });
    }

    const topN = Math.min(parseInt(searchParams.get('limit') ?? '8', 10) || 8, 20);
    const scored = rankModelSuggestions(modelQuery, candidates, topN);

    return Response.json({
      suggestions: scored.map((s) => ({ label: s.label, key: s.key })),
    });
  } catch (err) {
    console.error('[similar-models] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error', suggestions: [] },
      { status: 500 }
    );
  }
}
