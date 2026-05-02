/**
 * GET /api/search/popular?lang=ro
 * Returns up to 24 active popular suggestions (Căutări frecvente) from DB.
 * When table is empty: auto-builds from products (in memory) and returns them so UI never shows only static list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { CATEGORY_DISPLAY, getSlugsForDisplay } from '@/lib/search/categoryRules';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const BRAND_KEYWORDS = [
  'bmw', 'mercedes', 'audi', 'samsung', 'apple', 'nike', 'adidas', 'dacia', 'renault',
  'volkswagen', 'ford', 'opel', 'peugeot', 'citroen', 'fiat', 'toyota', 'xiaomi', 'huawei', 'iphone',
];

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

const TITLE_KEYWORDS_TO_QUERY: Array<{ terms: string[]; phrase: string }> = [
  { terms: ['apartament', 'apartamente'], phrase: 'apartament' },
  { terms: ['casa', 'case', 'vila', 'vile'], phrase: 'casa' },
  { terms: ['teren', 'terenuri'], phrase: 'teren' },
  { terms: ['spatiu comercial', 'spatii comerciale', 'hala', 'hale'], phrase: 'spatiu comercial' },
  { terms: ['autoturism', 'autoturisme', 'masina', 'masini', 'auto'], phrase: 'masina' },
  { terms: ['camion', 'camioane'], phrase: 'camion' },
  { terms: ['utilaj', 'utilaje'], phrase: 'utilaj' },
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

function buildPopularFromProducts(products: any[]): Array<{ label: string; q: string; categorySlug?: string; subcategorySlug?: string }> {
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const brands = new Set<string>();
  products.forEach((p: any) => {
    if (p.category && String(p.category).trim()) categories.add(String(p.category).trim());
    if (p.subcategory && String(p.subcategory).trim()) subcategories.add(String(p.subcategory).trim());
    const title = (p.title || '').toLowerCase();
    for (const kw of BRAND_KEYWORDS) {
      if (title.includes(kw)) brands.add(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  });
  const out: Array<{ label: string; q: string; categorySlug?: string; subcategorySlug?: string }> = [];
  const strictSeen = new Set<string>();
  for (const p of products) {
    const city = (p.city || p.product_location || '').toString();
    const strictQuery = extractStrictTitleQuery(p.title || '', city);
    if (!strictQuery) continue;
    const key = strictQuery.toLowerCase();
    if (strictSeen.has(key)) continue;
    strictSeen.add(key);
    const slugs = getSlugsForDisplay(strictQuery, p.category, p.subcategory);
    out.push({
      label: strictQuery,
      q: strictQuery,
      categorySlug: slugs.categorySlug,
      subcategorySlug: slugs.subcategorySlug,
    });
    if (out.length >= 16) break;
  }
  for (const cat of Array.from(categories).slice(0, 12)) {
    const slugs = getSlugsForDisplay(cat, cat);
    out.push({ label: cat, q: cat, categorySlug: slugs.categorySlug, subcategorySlug: slugs.subcategorySlug });
  }
  for (const sub of Array.from(subcategories).slice(0, 12)) {
    const slugs = getSlugsForDisplay(sub, undefined, sub);
    out.push({
      label: CATEGORY_DISPLAY[slugs.subcategorySlug || ''] || sub,
      q: sub,
      categorySlug: slugs.categorySlug,
      subcategorySlug: slugs.subcategorySlug,
    });
  }
  for (const brand of Array.from(brands).slice(0, 10)) {
    out.push({ label: brand, q: brand.toLowerCase(), categorySlug: undefined, subcategorySlug: undefined });
  }
  return out.slice(0, 24);
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const lang = request.nextUrl.searchParams.get('lang') || 'ro';
    if (!supabaseAdmin) {
      return NextResponse.json({ popular: [] });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('search_popular_suggestions')
      .select('label, q, category_slug, subcategory_slug')
      .eq('lang', lang)
      .eq('active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(24);

    if (!error && rows && rows.length > 0) {
      const popular = rows.map((r: any) => ({
        label: r.label ?? r.q,
        q: r.q ?? r.label,
        categorySlug: r.category_slug ?? undefined,
        subcategorySlug: r.subcategory_slug ?? undefined,
      }));
      return NextResponse.json({ popular });
    }

    // Table empty or missing: build from products so UI never shows only static list (e.g. private window)
    try {
      const { data: products, error: prodError } = await supabaseAdmin
        .from('products')
        .select('id, title, category, subcategory, city, product_location')
        .or('status.eq.active,approval_status.eq.approved')
        .not('title', 'is', null)
        .limit(500);

      if (!prodError && products && products.length > 0) {
        const popular = buildPopularFromProducts(products);
        if (popular.length > 0) {
          return NextResponse.json({ popular });
        }
      }
    } catch (buildErr) {
      console.warn('[search/popular] build from products', buildErr);
    }

    return NextResponse.json({ popular: [] });
  } catch (e) {
    console.warn('[search/popular]', e);
    return NextResponse.json({ popular: [] });
  }
}
