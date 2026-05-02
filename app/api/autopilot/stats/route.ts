/**
 * API Route - Autopilot Stats
 * Returnează statistici despre cheltuială și performanță
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSpendStats } from '@/lib/autopilot/costGuard';
import { getDecisionStats } from '@/lib/autopilot/decisionEngine';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Obține statistici de cheltuială
    const spendStats = await getSpendStats();

    // Obține statistici de decizie
    const decisionStats = await getDecisionStats();

    return NextResponse.json({
      success: true,
      stats: {
        ...spendStats,
        ...decisionStats,
      },
    });
  } catch (error: any) {
    console.error('Error in /api/autopilot/stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get stats',
      },
      { status: 500 }
    );
  }
}


