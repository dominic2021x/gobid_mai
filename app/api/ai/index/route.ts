/**
 * API Route: Indexare embeddings în Supabase (pgvector) pentru RAG
 * POST /api/ai/index
 * Body: { type: "products" | "pages" | "all", force?: boolean, limit?: number }
 * Header: x-admin-secret (optional în dev)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateEmbeddingsBatch } from '@/utils/embeddings';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH_SIZE = 50;
const DEFAULT_LIMIT = 1000;

function requireAdmin(request: NextRequest): NextResponse | null {
  const adminSecret = process.env.ADMIN_SECRET;
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev && !adminSecret) {
    return null;
  }
  if (isDev && adminSecret) {
    const headerSecret = request.headers.get('x-admin-secret');
    if (headerSecret === adminSecret) return null;
    return NextResponse.json({ error: 'Invalid or missing x-admin-secret' }, { status: 401 });
  }
  const headerSecret = request.headers.get('x-admin-secret');
  if (!headerSecret || headerSecret !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized: x-admin-secret required' }, { status: 401 });
  }
  return null;
}

function buildProductText(row: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  starting_price_ron?: number | null;
}): string {
  const parts = [
    row.title ?? '',
    row.description ?? '',
    row.category != null ? `Categoria: ${row.category}` : '',
    row.subcategory != null ? `Subcategoria: ${row.subcategory}` : '',
    row.starting_price_ron != null ? `Pret: ${row.starting_price_ron}` : '',
  ].filter(Boolean);
  return parts.join('. ').trim().substring(0, 8000) || String(row.title ?? '');
}

function buildPageText(row: { title?: string | null; content?: string | null }): string {
  const parts = [row.title ?? '', row.content ?? ''].filter(Boolean);
  return parts.join('. ').trim().substring(0, 8000) || String(row.title ?? '');
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 500 }
    );
  }

  let body: { type?: string; force?: boolean; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const type = body.type === 'products' || body.type === 'pages' || body.type === 'all'
    ? body.type
    : 'all';
  const force = Boolean(body.force);
  const limit = typeof body.limit === 'number' && body.limit > 0
    ? Math.min(body.limit, 5000)
    : DEFAULT_LIMIT;

  let totalIndexed = 0;
  let totalSkipped = 0;
  const errors: string[] = [];
  const limitProducts = type === 'all' ? limit : limit;
  const limitPages = type === 'all' ? limit : limit;

  if (type === 'products' || type === 'all') {
    let hasMore = true;
    while (hasMore && totalIndexed + totalSkipped < limitProducts) {
      const take = Math.min(BATCH_SIZE, limitProducts - totalIndexed - totalSkipped);
      let query = supabaseAdmin
        .from('products')
        .select('id, title, description, category, subcategory, starting_price_ron')
        .not('title', 'is', null)
        .limit(take);

      if (!force) {
        query = query.is('embedding', null);
      }

      const { data: rows, error: fetchError } = await query;

      if (fetchError) {
        errors.push(`products fetch: ${fetchError.message}`);
        break;
      }
      if (!rows || rows.length === 0) {
        hasMore = false;
        break;
      }

      const texts = rows.map((row: any) => buildProductText(row));
      let embeddings: number[][];
      try {
        embeddings = await generateEmbeddingsBatch(texts, 1536);
      } catch (e: any) {
        errors.push(`products embeddings: ${e?.message || String(e)}`);
        break;
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const embedding = embeddings[i];
        if (!embedding || embedding.length !== 1536) {
          totalSkipped++;
          continue;
        }
        const { error: updateError } = await supabaseAdmin
          .from('products')
          .update({ embedding })
          .eq('id', row.id);

        if (updateError) {
          errors.push(`products update ${row.id}: ${updateError.message}`);
          totalSkipped++;
        } else {
          totalIndexed++;
        }
      }

      if (rows.length < BATCH_SIZE) hasMore = false;
      if (totalIndexed + totalSkipped >= limitProducts) hasMore = false;
    }
  }

  if (type === 'pages' || type === 'all') {
    let hasMore = true;
    const soFar = totalIndexed + totalSkipped;
    while (hasMore && totalIndexed + totalSkipped - soFar < limitPages) {
      const take = Math.min(BATCH_SIZE, limitPages - (totalIndexed + totalSkipped - soFar));
      let query = supabaseAdmin
        .from('pages')
        .select('id, title, content')
        .not('title', 'is', null)
        .limit(take);

      if (!force) {
        query = query.is('embedding', null);
      }

      const { data: rows, error: fetchError } = await query;

      if (fetchError) {
        errors.push(`pages fetch: ${fetchError.message}`);
        break;
      }
      if (!rows || rows.length === 0) {
        hasMore = false;
        break;
      }

      const texts = rows.map((row: any) => buildPageText(row));
      let embeddings: number[][];
      try {
        embeddings = await generateEmbeddingsBatch(texts, 1536);
      } catch (e: any) {
        errors.push(`pages embeddings: ${e?.message || String(e)}`);
        break;
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const embedding = embeddings[i];
        if (!embedding || embedding.length !== 1536) {
          totalSkipped++;
          continue;
        }
        const { error: updateError } = await supabaseAdmin
          .from('pages')
          .update({ embedding })
          .eq('id', row.id);

        if (updateError) {
          errors.push(`pages update ${row.id}: ${updateError.message}`);
          totalSkipped++;
        } else {
          totalIndexed++;
        }
      }

      if (rows.length < BATCH_SIZE) hasMore = false;
      if (totalIndexed + totalSkipped - soFar >= limitPages) hasMore = false;
    }
  }

  return NextResponse.json({
    indexed: totalIndexed,
    skipped: totalSkipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
