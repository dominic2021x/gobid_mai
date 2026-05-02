/**
 * POST /api/payu/test
 * Verifică credentialele PayU (OAuth token). Citește config din getPayUConfig() (admin_modules sau ENV).
 */

import { NextResponse } from 'next/server';
import { getPayUConfig } from '@/lib/payu-config';
import { getPayUOAuthToken } from '@/lib/payu-payment';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST() {
  try {
    const config = await getPayUConfig();
    if (!config) {
      return NextResponse.json(
        { success: false, message: 'PayU nu este configurat. Completează setările în Admin → Module → PayU Payments și salvează.' },
        { status: 200 }
      );
    }
    const token = await getPayUOAuthToken(config);
    if (token) {
      return NextResponse.json({
        success: true,
        message: `PayU ${config.testMode ? 'Test' : 'Live'}: autentificare reușită.`,
      });
    }
    return NextResponse.json(
      { success: false, message: 'PayU a respins autentificarea. Verifică Client ID, Client Secret și Merchant POS ID pentru mediul selectat.' },
      { status: 200 }
    );
  } catch (err) {
    console.warn('[PayU test]', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Eroare la verificarea PayU.' },
      { status: 200 }
    );
  }
}
