/**
 * POST /api/admin/search/popular/generate
 * Generate popular suggestions from DB: real categories/subcategories, brands, optional short phrases.
 * Overwrites active rows (mark old inactive, insert new). Admin-only in production (use middleware or session check).
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { CATEGORY_DISPLAY, getSlugsForDisplay } from '@/lib/search/categoryRules';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const BRAND_KEYWORDS = [
  'bmw', 'mercedes', 'audi', 'samsung', 'apple', 'nike', 'adidas', 'levis', 'dacia', 'renault',
  'volkswagen', 'ford', 'opel', 'peugeot', 'citroen', 'fiat', 'toyota', 'honda', 'mazda', 'hyundai',
  'kia', 'skoda', 'seat', 'xiaomi', 'huawei', 'iphone',
];

const TITLE_KEYWORDS_TO_QUERY: Array<{ terms: string[]; phrase: string }> = [
  { terms: ['apartament', 'apartamente'], phrase: 'apartament' },
  { terms: ['casa', 'case', 'vila', 'vile'], phrase: 'casa' },
  { terms: ['teren', 'terenuri'], phrase: 'teren' },
  { terms: ['spatiu comercial', 'spatii comerciale', 'hala', 'hale'], phrase: 'spatiu comercial' },
  { terms: ['autoturism', 'autoturisme', 'masina', 'masini', 'auto'], phrase: 'masina' },
  { terms: ['camion', 'camioane'], phrase: 'camion' },
  { terms: ['remorca', 'remorci'], phrase: 'remorca' },
  { terms: ['utilaj', 'utilaje', 'echipament', 'echipamente'], phrase: 'utilaj' },
  { terms: ['telefon', 'telefoane', 'iphone', 'samsung'], phrase: 'telefon' },
  { terms: ['laptop', 'laptopuri'], phrase: 'laptop' },
];

function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStrictTitleQuery(title: string, city?: string): string | null {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;
  let phrase = '';
  for (const rule of TITLE_KEYWORDS_TO_QUERY) {
    if (rule.terms.some((t) => normalizedTitle.includes(normalizeText(t)))) {
      phrase = rule.phrase;
      break;
    }
  }
  if (!phrase) return null;
  const cityPart = (city || '').trim();
  return cityPart ? `${phrase} ${cityPart}` : phrase;
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const runtime = 'nodejs';

const MAX_CATEGORY_SUGGESTIONS = 40;
const MAX_SUBCATEGORY_SUGGESTIONS = 80;
const MAX_BRAND_SUGGESTIONS = 40;
const MAX_TOTAL_SUGGESTIONS = 200;

export async function POST() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Admin client not configured' }, { status: 503 });
    }

    const { data: products, error: prodError } = await supabaseAdmin
      .from('products')
      .select('id, title, category, subcategory, city, product_location, status, approval_status')
      .or('status.eq.active,approval_status.eq.approved')
      .not('title', 'is', null);

    if (prodError) {
      console.error('[admin/search/popular/generate]', prodError);
      return NextResponse.json({ ok: false, error: prodError.message }, { status: 500 });
    }

    const list = products || [];
    const categories = new Set<string>();
    const subcategories = new Set<string>();
    const brands = new Set<string>();

    list.forEach((p: any) => {
      if (p.category && String(p.category).trim()) categories.add(String(p.category).trim());
      if (p.subcategory && String(p.subcategory).trim()) subcategories.add(String(p.subcategory).trim());
      const title = (p.title || '').toLowerCase();
      for (const kw of BRAND_KEYWORDS) {
        if (title.includes(kw)) brands.add(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    });

    const suggestions: { label: string; q: string; category_slug: string | null; subcategory_slug: string | null; priority: number }[] = [];
    let priority = 1000;

    for (const cat of Array.from(categories).slice(0, MAX_CATEGORY_SUGGESTIONS)) {
      const slugs = getSlugsForDisplay(cat, cat);
      suggestions.push({
        label: cat,
        q: cat,
        category_slug: slugs.categorySlug ?? null,
        subcategory_slug: slugs.subcategorySlug ?? null,
        priority: priority--,
      });
    }
    for (const sub of Array.from(subcategories).slice(0, MAX_SUBCATEGORY_SUGGESTIONS)) {
      const slugs = getSlugsForDisplay(sub, undefined, sub);
      const display = CATEGORY_DISPLAY[slugs.subcategorySlug || ''] || sub;
      suggestions.push({
        label: display,
        q: sub,
        category_slug: slugs.categorySlug ?? null,
        subcategory_slug: slugs.subcategorySlug ?? null,
        priority: priority--,
      });
    }
    for (const brand of Array.from(brands).slice(0, MAX_BRAND_SUGGESTIONS)) {
      suggestions.push({ label: brand, q: brand.toLowerCase(), category_slug: null, subcategory_slug: null, priority: priority-- });
    }

    // Strict "normal searches" from titles (e.g. "apartament craiova")
    const strictSeen = new Set<string>();
    for (const p of list) {
      const city = (p as any).city || (p as any).product_location || '';
      const strictQuery = extractStrictTitleQuery((p as any).title || '', city);
      if (!strictQuery) continue;
      const key = strictQuery.toLowerCase();
      if (strictSeen.has(key)) continue;
      strictSeen.add(key);
      const slugs = getSlugsForDisplay(strictQuery, (p as any).category, (p as any).subcategory);
      suggestions.unshift({
        label: strictQuery,
        q: strictQuery,
        category_slug: slugs.categorySlug ?? null,
        subcategory_slug: slugs.subcategorySlug ?? null,
        priority: priority--,
      });
      if (strictSeen.size >= 120) break;
    }

    const lang = 'ro';
    const { error: deactivateError } = await supabaseAdmin
      .from('search_popular_suggestions')
      .update({ active: false })
      .eq('lang', lang);

    if (deactivateError) {
      console.warn('[admin/search/popular/generate] deactivate', deactivateError.message);
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const toInsert = suggestions.slice(0, MAX_TOTAL_SUGGESTIONS).map((s) => ({
      lang,
      label: s.label,
      q: s.q,
      category_slug: s.category_slug,
      subcategory_slug: s.subcategory_slug,
      priority: s.priority,
      active: true,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('search_popular_suggestions')
      .insert(toInsert);

    if (insertError) {
      console.error('[admin/search/popular/generate] insert', insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: toInsert.length });
  } catch (e: any) {
    console.error('[admin/search/popular/generate]', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
