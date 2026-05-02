/**
 * POST /api/search/image
 * Image-based product search using GPT-4o Vision + Pinecone.
 * Rezultatele sunt filtrate la produsele afișate pe /ro (active, reserved, sold).
 */

import { NextRequest, NextResponse } from 'next/server';
import { visionToProductQuery } from '@/lib/image-search/vision';
import { buildSearchableText } from '@/lib/image-search/text-builder';
import { embedText, pineconeSearch, rerankAndDedup, determineMatchStatus } from '@/lib/image-search/search';
import { ImageSearchResponse } from '@/lib/image-search/types';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Rate limiting (in-memory, TODO: replace with Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  try {
    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Validate OpenAI and Pinecone config
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const topKParam = formData.get('topK');
    const topK = topKParam ? parseInt(topKParam as string, 10) : 80;

    if (!imageFile) {
      return NextResponse.json(
        { error: 'Image file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (8MB limit)
    const maxSize = 8 * 1024 * 1024; // 8MB
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 8MB limit' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    console.log(`[Image Search ${requestId}] Processing image: ${imageFile.name}, ${imageFile.size} bytes, type: ${imageFile.type}`);

    // Step 1: Extract structured query from image using GPT-4o Vision
    const visionStart = Date.now();
    const query = await visionToProductQuery(imageBuffer, imageFile.type);
    console.log(`[Image Search ${requestId}] Vision extraction: ${Date.now() - visionStart}ms`);

    // Step 2: Build searchable text
    const searchableText = buildSearchableText(query);
    console.log(`[Image Search ${requestId}] Searchable text: ${searchableText.substring(0, 100)}...`);

    // Step 3: Create embedding
    const embedStart = Date.now();
    const embedding = await embedText(searchableText);
    console.log(`[Image Search ${requestId}] Embedding created: ${Date.now() - embedStart}ms`);

    // Step 4: Search Pinecone
    const searchStart = Date.now();
    let matches;
    try {
      matches = await pineconeSearch(embedding, topK);
      console.log(`[Image Search ${requestId}] Pinecone search: ${matches.length} matches in ${Date.now() - searchStart}ms`);
      
      // Log first few matches for debugging
      if (matches.length > 0) {
        console.log(`[Image Search ${requestId}] Top 3 matches:`, matches.slice(0, 3).map(m => ({
          id: m.id,
          score: m.score.toFixed(3),
          productId: m.metadata.productId,
          title: m.metadata.title?.substring(0, 50)
        })));
      } else {
        console.log(`[Image Search ${requestId}] ⚠️ No matches found in Pinecone. Make sure products are indexed.`);
        // Return empty results instead of error
        return NextResponse.json({
          query,
          match: { status: 'none', productId: null, score: null },
          similars: [],
        });
      }
    } catch (error: any) {
      console.error(`[Image Search ${requestId}] Pinecone search error:`, error);
      throw new Error(`Pinecone search failed: ${error.message}`);
    }

    // Step 5: Rerank and deduplicate
    const rerankStart = Date.now();
    let similars = rerankAndDedup(matches, query);
    console.log(`[Image Search ${requestId}] Reranking: ${similars.length} similars in ${Date.now() - rerankStart}ms`);

    // Step 6: Filtrare la produsele din /ro (active, reserved, sold) – aceeași logică ca pe pagina /ro
    if (supabaseAdmin) {
      try {
        const { data: roProducts, error } = await supabaseAdmin
          .from('products')
          .select('id')
          .in('status', ['active', 'reserved', 'sold'])
          .order('created_at', { ascending: false })
          .limit(500);

        if (!error && roProducts?.length) {
          const roProductIds = new Set(roProducts.map((p: { id: string }) => String(p.id)));
          const before = similars.length;
          similars = similars.filter((s) => roProductIds.has(String(s.productId)));
          console.log(`[Image Search ${requestId}] Filtered to /ro products: ${before} → ${similars.length} (${roProductIds.size} products on /ro)`);
        }
      } catch (err: any) {
        console.warn(`[Image Search ${requestId}] Could not filter by /ro products:`, err?.message);
      }
    }

    // Step 7: Determine match status (după filtrare)
    const match = determineMatchStatus(similars, query);

    const totalTime = Date.now() - startTime;
    console.log(`[Image Search ${requestId}] Total time: ${totalTime}ms, Match: ${match.status}, Similars: ${similars.length}`);

    // Build response
    const response: ImageSearchResponse = {
      query,
      match,
      similars,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`[Image Search ${requestId}] Error after ${totalTime}ms:`, error);
    console.error(`[Image Search ${requestId}] Error stack:`, error.stack);
    
    // Return a valid response format even on error
    return NextResponse.json(
      {
        error: 'Failed to process image search',
        message: error.message || 'Unknown error',
        requestId,
        query: null,
        match: { status: 'none', productId: null, score: null },
        similars: [],
      },
      { status: 500 }
    );
  }
}
