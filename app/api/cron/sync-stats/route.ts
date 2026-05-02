/**
 * API Route - Sync Social Media Stats (CRON)
 * GET /api/cron/sync-stats
 * Sincronizează statisticile de pe TikTok, Instagram și YouTube
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncAllVideoStats } from '@/lib/analytics/social-sync';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 600; // până la 10 minute

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (
      process.env.NODE_ENV !== 'development' &&
      cronSecret &&
      authHeader !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Starting video stats sync...');
    console.log('📅 Date:', new Date().toISOString());
    console.time('⏱️ SyncStats Duration');

    // Timeout intern de siguranță
    const timeout = setTimeout(() => {
      console.warn('⚠️ SyncStats timeout reached (9 min)');
    }, 9 * 60 * 1000);

    // ✅ Fără argument — funcția nu acceptă parametri
    await syncAllVideoStats();

    clearTimeout(timeout);
    console.timeEnd('⏱️ SyncStats Duration');

    return NextResponse.json(
      {
        success: true,
        message: 'Video stats synced successfully',
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Error in /api/cron/sync-stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync stats',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
