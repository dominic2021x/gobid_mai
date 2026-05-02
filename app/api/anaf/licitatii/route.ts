/**
 * API Route - ANAF Licitații
 * GET /api/anaf/licitatii
 * 
 * Obține lista de licitații ANAF cu filtre opționale
 */

import { NextRequest, NextResponse } from 'next/server';
import { getANAFlicitatii } from '@/lib/anaf/db';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const filters = {
      judet: searchParams.get('judet') || undefined,
      tip_bun: searchParams.get('tip_bun') || undefined,
      data_licitatie_from: searchParams.get('data_licitatie_from') || undefined,
      data_licitatie_to: searchParams.get('data_licitatie_to') || undefined,
      status: searchParams.get('status') || 'active',
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    console.log('[ANAF Licitatii] Fetching with filters:', filters);
    
    const result = await getANAFlicitatii(filters);

    console.log('[ANAF Licitatii] Found', result.count, 'licitatii');

    return NextResponse.json({
      success: true,
      data: result.data,
      count: result.count,
    });
  } catch (error: any) {
    console.error('[ANAF Licitatii] Error fetching licitatii:', error);
    console.error('[ANAF Licitatii] Error stack:', error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch licitatii',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

