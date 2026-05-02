/**
 * API Route - Salvare SEO
 * POST /api/seo/save
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveSeo, updateSeo } from '@/lib/db/seo';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.produs_id) {
      return NextResponse.json(
        { error: 'produs_id este obligatoriu' },
        { status: 400 }
      );
    }

    // Dacă există ID, actualizează; altfel creează nou
    const seo = body.id 
      ? await updateSeo(body.produs_id, body)
      : await saveSeo(body);

    return NextResponse.json(
      { success: true, seo },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/seo/save:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save SEO' },
      { status: 500 }
    );
  }
}


