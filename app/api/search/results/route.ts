/**
 * GET /api/search/results
 * Never-empty search results with scenario ladder + infinite waterfall pagination.
 * Params: q, lang, categorySlug?, subcategorySlug?, locationId? (city), cursor?, scenarioIndex?
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildScenarios, type SearchScenario } from '@/lib/search/fallbackLadder';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 10;

const PAGE_SIZE = 20;
const MAX_SCENARIOS = 15;

function normalizeCategoryKey(s: string | null | undefined): string {
  if (!s || s === 'all') return 'all';
  return String(s).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get('q') || '').trim();
    const categorySlug = params.get('categorySlug') || params.get('category') || '';
    const subcategorySlug = params.get('subcategorySlug') || params.get('subcategory') || '';
    const locationId = (params.get('locationId') || params.get('location') || '').trim();
    const cursor = Math.max(0, parseInt(params.get('cursor') || '0', 10));
    let scenarioIndex = Math.max(0, parseInt(params.get('scenarioIndex') || '0', 10));

    if (!supabaseAdmin) {
      return NextResponse.json(
        { items: [], meta: { expandedLocation: false, expandedCategory: false, termsReduced: false }, usedScenario: null, next: null },
        { status: 200 }
      );
    }

    const categoryKey = normalizeCategoryKey(categorySlug) || 'all';
    const subcategoryKey = normalizeCategoryKey(subcategorySlug) || 'all';
    const location = locationId && locationId !== 'all' ? locationId : 'all';

    const filters = {
      location,
      categoryKey: categoryKey === 'all' && q ? 'all' : categoryKey,
      subcategoryKey: subcategoryKey === 'all' && q ? 'all' : subcategoryKey,
      query: q,
    };

    const scenarios = buildScenarios(filters).slice(0, MAX_SCENARIOS);

    let scenario: SearchScenario | undefined = scenarios[scenarioIndex];
    let items: any[] = [];
    let usedScenario: { scenarioIndex: number; locationMode: string; categorySlug?: string; subcategorySlug?: string; usedTokens: string[] } | null = null;
    let meta = { expandedLocation: false, expandedCategory: false, termsReduced: false };

    while (scenarioIndex < scenarios.length) {
      scenario = scenarios[scenarioIndex];
      if (!scenario) break;

      let query = supabaseAdmin
        .from('products')
        .select('id, title, description, images, starting_price_ron, category, subcategory, url, slug, city, county, status, approval_status')
        .neq('status', 'deleted')
        .or('status.eq.active,approval_status.eq.approved')
        .not('title', 'is', null);

      if (scenario.locationMode === 'strict' && location && location !== 'all') {
        query = query.ilike("locality_search", `%${location}%`);
      }

      if (scenario.categoryKey && scenario.categoryKey !== 'all') {
        const catPattern = scenario.categoryKey.replace(/-/g, '%');
        query = query.ilike('category', `%${catPattern}%`);
      }
      if (scenario.subcategoryKey && scenario.subcategoryKey !== 'all') {
        const subPattern = scenario.subcategoryKey.replace(/-/g, '%');
        query = query.ilike('subcategory', `%${subPattern}%`);
      }

      if (scenario.tokenStep && scenario.tokenStep.trim()) {
        const term = scenario.tokenStep.trim().toLowerCase();
        query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%,subcategory.ilike.%${term}%`);
      }

      const { data: rows, error } = await query
        .order('created_at', { ascending: false })
        .range(cursor, cursor + PAGE_SIZE - 1);

      if (error) {
        console.warn('[search/results]', error.message);
        scenarioIndex++;
        continue;
      }

      const list = (rows || []).map((p: any) => {
        const imageUrl = Array.isArray(p.images) && p.images.length > 0
          ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.url)
          : undefined;
        const url = p.url || (p.slug ? `/licitatii-publice/${p.slug}` : `/licitatii-publice/${p.id}`);
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          image: imageUrl,
          price: p.starting_price_ron,
          category: p.category,
          subcategory: p.subcategory,
          url,
          city: p.city,
          county: p.county,
        };
      });

      if (list.length > 0) {
        items = list;
        meta = {
          expandedLocation: scenario.reasonFlags.locationExpanded,
          expandedCategory: scenario.reasonFlags.categoryExpanded,
          termsReduced: scenario.reasonFlags.termsReduced,
        };
        usedScenario = {
          scenarioIndex,
          locationMode: scenario.locationMode,
          categorySlug: scenario.categoryKey !== 'all' ? scenario.categoryKey : undefined,
          subcategorySlug: scenario.subcategoryKey !== 'all' ? scenario.subcategoryKey : undefined,
          usedTokens: scenario.tokenStep ? [scenario.tokenStep] : [],
        };
        break;
      }

      scenarioIndex++;
    }

    if (items.length === 0 && scenarioIndex >= scenarios.length) {
      const fallback = await supabaseAdmin
        .from('products')
        .select('id, title, description, images, starting_price_ron, category, subcategory, url, slug, city, county')
        .neq('status', 'deleted')
        .or('status.eq.active,approval_status.eq.approved')
        .not('title', 'is', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fallback.data && fallback.data.length > 0) {
        items = (fallback.data as any[]).map((p: any) => {
          const imageUrl = Array.isArray(p.images) && p.images.length > 0 ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.url) : undefined;
          const url = p.url || (p.slug ? `/licitatii-publice/${p.slug}` : `/licitatii-publice/${p.id}`);
          return { id: p.id, title: p.title, description: p.description, image: imageUrl, price: p.starting_price_ron, category: p.category, subcategory: p.subcategory, url, city: p.city, county: p.county };
        });
        meta = { expandedLocation: true, expandedCategory: true, termsReduced: true };
        usedScenario = { scenarioIndex: -1, locationMode: 'all', usedTokens: [] };
      }
    }

    const hasMore = items.length >= PAGE_SIZE;
    const next = hasMore
      ? { scenarioIndex: usedScenario?.scenarioIndex ?? scenarioIndex, cursor: cursor + PAGE_SIZE }
      : scenarioIndex + 1 < scenarios.length
        ? { scenarioIndex: scenarioIndex + 1, cursor: 0 }
        : null;

    return NextResponse.json({
      items,
      meta,
      usedScenario,
      next,
    });
  } catch (e: any) {
    console.error('[search/results]', e);
    return NextResponse.json(
      { items: [], meta: { expandedLocation: false, expandedCategory: false, termsReduced: false }, usedScenario: null, next: null, error: e?.message },
      { status: 200 }
    );
  }
}
