/**
 * API Route pentru Căutare Semantică de Produse
 * Folosește embeddings pentru a găsi produse similare în limbaj natural
 */

import { NextRequest, NextResponse } from 'next/server';
import { retrieveContext } from '@/lib/ai/rag';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const { query, filters } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // Caută produse similare folosind retrieveContext (care folosește Supabase)
    const searchResults = await retrieveContext(query, 'produse', 20);

    // Filtrează doar produsele
    const products = searchResults
      .filter(result => result.type === 'product')
      .map(result => ({
        id: result.id,
        title: result.metadata?.title || result.text.substring(0, 100),
        description: result.text,
        price: result.metadata?.price || null,
        category: result.metadata?.category || null,
        image: result.metadata?.image || null,
        score: result.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10 produse

    return NextResponse.json({
      products,
      total: products.length,
      query,
    });
  } catch (error: any) {
    console.error('Semantic search error:', error);
    return NextResponse.json(
      {
        error: 'Error processing search request',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

















