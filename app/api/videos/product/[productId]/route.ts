/**
 * API Route - Clipuri Video pentru un Produs
 * GET /api/videos/product/[productId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVideosByProductId } from '@/lib/db/videos';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const videos = await getVideosByProductId(productId);
    return NextResponse.json(videos, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/videos/product/[productId]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get videos' },
      { status: 500 }
    );
  }
}

