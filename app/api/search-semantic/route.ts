/**
 * Semantic Search API - Pinecone RAG
 * Căutare semantică avansată cu filtre dinamice
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/utils/embeddings';
import { queryVectors, checkPineconeConnection } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 10;

export interface SemanticSearchResult {
  id: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  price?: number;
  image?: string;
  url?: string;
  score: number;
  type: 'product' | 'page';
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 10, filters } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Verifică conexiunea Pinecone
    const isConnected = await checkPineconeConnection();
    if (!isConnected) {
      // Fallback: returnează rezultate goale sau folosește căutare simplă
      return NextResponse.json({
        results: [],
        query,
        total: 0,
        time: Date.now() - startTime,
        warning: 'Pinecone not available, using fallback',
      });
    }

    // Generează embedding pentru query
    const queryEmbedding = await generateEmbedding(query);

    // Construiește filtru pentru Pinecone
    let pineconeFilter: Record<string, any> | undefined;
    if (filters) {
      pineconeFilter = {};
      
      if (filters.category) {
        pineconeFilter.category = { $eq: filters.category };
      }
      
      if (filters.location) {
        pineconeFilter.location = { $eq: filters.location };
      }
      
      if (filters.type) {
        pineconeFilter.type = { $eq: filters.type };
      }
      
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        pineconeFilter.price = {};
        if (filters.minPrice !== undefined) {
          pineconeFilter.price.$gte = filters.minPrice;
        }
        if (filters.maxPrice !== undefined) {
          pineconeFilter.price.$lte = filters.maxPrice;
        }
      }
    }

    // Caută în Pinecone
    const matches = await queryVectors(
      queryEmbedding,
      Math.min(limit * 2, 50), // Caută mai multe pentru a filtra mai târziu
      pineconeFilter
    );

    // Transformă rezultatele
    const results: SemanticSearchResult[] = matches
      .map((match: any) => {
        const metadata = match.metadata || {};
        return {
          id: match.id || metadata.id || '',
          title: metadata.title || 'Fără titlu',
          description: metadata.description,
          category: metadata.category,
          location: metadata.location,
          price: metadata.price,
          image: metadata.image,
          url: metadata.url,
          score: match.score || 0,
          type: metadata.type || 'product',
          metadata,
        };
      })
      .filter((result: SemanticSearchResult) => result.score > 0.5) // Filtrează scoruri mici
      .slice(0, limit); // Limitează rezultatele

    // Sortează după scor
    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      results,
      query,
      total: results.length,
      time: Date.now() - startTime,
      success: true,
    });
  } catch (error: any) {
    console.error('Semantic search error:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform semantic search',
        details: error.message,
        results: [],
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  // Redirect către POST cu același query
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ query }),
    })
  );
}

