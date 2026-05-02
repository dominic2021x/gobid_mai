/**
 * API Route - Adăugare Clip Video
 * POST /api/videos/add
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveVideo } from '@/lib/db/videos';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validare minimă
    if (!body.produs_id || !body.url) {
      return NextResponse.json(
        { error: 'produs_id și url sunt obligatorii' },
        { status: 400 }
      );
    }

    const video = await saveVideo(body);

    return NextResponse.json(
      { success: true, video },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/videos/add:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save video' },
      { status: 500 }
    );
  }
}


