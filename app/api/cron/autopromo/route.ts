/**
 * CRON Job - Auto-Promovare Zilnică
 * Generează și postează automat clipuri video cu avatar AI în limba română
 * Rulează zilnic (configurat în Vercel Scheduler sau cron job)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyAutoPromo } from '@/lib/video/autoPromo';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 🔐 verificare securitate (doar în producție)
    if (
      process.env.NODE_ENV !== 'development' &&
      cronSecret &&
      authHeader !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting daily auto-promo...');
    console.log('📅 Date:', new Date().toISOString());
    console.time('⏱️ AutoPromo Duration');

    // 🕒 Timeout de siguranță (9 minute)
    const timeout = setTimeout(() => {
      console.warn('⚠️ AutoPromo timeout reached (9 min)');
    }, 9 * 60 * 1000);

    const results = await runDailyAutoPromo({
      platform: 'all',
      provider: 'heygen',
      avatarName: 'Ana',
      autoUpload: true,
    });

    clearTimeout(timeout);
    console.timeEnd('⏱️ AutoPromo Duration');

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`✅ Auto-promo completed: ${successful} success, ${failed} failed`);

    return NextResponse.json(
      {
        success: true,
        message: 'Daily auto-promo completed',
        timestamp: new Date().toISOString(),
        results: {
          total: results.length,
          successful,
          failed,
          videos: results.map((r) => ({
            success: r.success,
            videoUrl: r.video?.url,
            platform: r.video?.platform,
            error: r.error,
          })),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Cron auto-promo error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run daily auto-promo',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
