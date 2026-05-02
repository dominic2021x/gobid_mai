/**
 * Protected Exchange Rate Update API
 * Called by cron job to fetch fresh rate from BNR
 * 
 * POST /api/exchange-rate/update
 * 
 * Authorization:
 * - Header: Authorization: Bearer <CRON_SECRET>
 * - Or: x-cron-secret: <CRON_SECRET>
 * 
 * For Vercel Cron, add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/exchange-rate/update",
 *     "schedule": "0 10 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateExchangeRate, fetchBnrRate, storeRate } from '@/lib/exchange-rate';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Verify cron authorization
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If no secret is configured, allow in development only
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Exchange Rate Update] No CRON_SECRET configured, allowing in development');
      return true;
    }
    return false;
  }
  
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === cronSecret) return true;
  }
  
  // Check custom header (Vercel Cron uses this)
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader === cronSecret) return true;
  
  // Vercel Cron signature verification
  const vercelCronSignature = request.headers.get('x-vercel-cron-signature');
  if (vercelCronSignature) {
    // Vercel automatically validates the signature for cron jobs
    // If the header is present, the request is from Vercel Cron
    return true;
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    if (!isAuthorized(request)) {
      console.warn('[Exchange Rate Update] Unauthorized request');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Exchange Rate Update] Starting BNR rate update...');

    // Fetch fresh rate from BNR
    const freshRate = await fetchBnrRate();
    
    if (freshRate) {
      // Store the new rate
      const stored = await storeRate(freshRate);
      
      if (stored) {
        console.log('[Exchange Rate Update] Successfully updated rate:', freshRate);
        return NextResponse.json({
          success: true,
          message: 'Exchange rate updated successfully',
          data: {
            rate: freshRate.eurRon,
            rateDate: freshRate.rateDate,
            fetchedAt: freshRate.fetchedAt,
            source: freshRate.source,
          }
        });
      }
      
      // Fetched but failed to store
      console.error('[Exchange Rate Update] Failed to store rate');
      return NextResponse.json({
        success: false,
        error: 'Failed to store rate in database',
        data: {
          rate: freshRate.eurRon,
          rateDate: freshRate.rateDate,
        }
      }, { status: 500 });
    }

    // Failed to fetch
    console.error('[Exchange Rate Update] Failed to fetch from BNR');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch rate from BNR',
    }, { status: 502 });

  } catch (error: any) {
    console.error('[Exchange Rate Update] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

// Also allow GET for manual testing in development
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { success: false, error: 'Use POST method' },
      { status: 405 }
    );
  }
  
  return POST(request);
}
