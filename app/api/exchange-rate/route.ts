/**
 * Public Exchange Rate API
 * Returns the cached BNR EUR/RON rate from database
 * 
 * GET /api/exchange-rate
 * 
 * Response:
 * {
 *   success: true,
 *   rate: 4.97,
 *   rateDate: "2024-01-15",
 *   publishedAt: "2024-01-15T10:00:00Z",
 *   source: "BNR",
 *   cached: true
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRate, type ExchangeRateData } from '@/lib/exchange-rate';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Fallback rate if everything fails
const FALLBACK_RATE = 4.97;

export async function GET(request: NextRequest) {
  try {
    const result = await getExchangeRate();
    
    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        rate: result.data.eurRon,
        rateDate: result.data.rateDate,
        publishedAt: result.data.fetchedAt,
        source: result.data.source,
        cached: result.cached ?? true,
      }, {
        headers: {
          // Cache for 5 minutes on CDN, 1 minute in browser
          'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=600',
        }
      });
    }

    // Fallback response
    return NextResponse.json({
      success: true,
      rate: FALLBACK_RATE,
      rateDate: new Date().toISOString().split('T')[0],
      publishedAt: new Date().toISOString(),
      source: 'BNR',
      cached: false,
      warning: 'Using fallback rate',
    });
  } catch (error: any) {
    console.error('[Exchange Rate API] Error:', error);
    
    // Never fail hard - return fallback
    return NextResponse.json({
      success: true,
      rate: FALLBACK_RATE,
      rateDate: new Date().toISOString().split('T')[0],
      publishedAt: new Date().toISOString(),
      source: 'BNR',
      cached: false,
      error: 'Service temporarily unavailable, using fallback rate',
    });
  }
}
