/**
 * GET /api/search/image/test
 * Test endpoint to check Pinecone connection and see what's indexed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPineconeIndex } from '@/lib/pinecone';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    if (!process.env.PINECONE_API_KEY) {
      return NextResponse.json(
        { error: 'PINECONE_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const index = await getPineconeIndex();
    
    // Get index stats
    const stats = await index.describeIndexStats();
    
    // Get index info to determine dimension
    const indexDescription = await index.describeIndexStats();
    const dimension = stats.dimension || 1536; // Default to 1536 if not found
    
    // Query with a dummy vector matching the index dimension
    const dummyVector = new Array(dimension).fill(0);
    const testQuery = await index.query({
      vector: dummyVector,
      topK: 5,
      includeMetadata: true,
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalVectors: stats.totalRecordCount || 0,
        dimension: stats.dimension || 0,
        indexFullness: stats.indexFullness || 0,
      },
      sampleResults: testQuery.matches?.slice(0, 5).map((m: any) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata,
      })) || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to test Pinecone',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
