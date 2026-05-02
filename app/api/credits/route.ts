import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getApiAuthIdentity } from '@/lib/auth/getApiAuthIdentity';

const DEBUG = process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';

/** Evită 304 / cache la GET — altfel `fetch().ok` e false și corpul e gol, iar UI loghează erori false. */
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

function jsonWithNoCache(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status });
  Object.entries(NO_STORE).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

// GET - Obține credite pentru user-ul curent (suma tuturor plăților din user_payments)
export async function GET(request: NextRequest) {
  try {
    const identity = await getApiAuthIdentity(request);
    if (!identity) {
      return jsonWithNoCache({ error: 'Missing authentication' }, { status: 401 });
    }
    const { userId } = identity;

    if (!supabaseAdmin) {
      if (DEBUG) console.warn('[Credits API] SUPABASE_SERVICE_ROLE_KEY not set; returning 0 credits.');
      return jsonWithNoCache({
        success: true,
        credit: 0,
        payments: [],
        paymentCount: 0,
      });
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('user_payments')
      .select('amount, id, created_at, payment_type, description, invoice_number, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (paymentsError) {
      const code = String((paymentsError as { code?: string }).code ?? '');
      const msg = paymentsError.message ?? '';
      if (code === 'PGRST205' || /does not exist|relation.*not found/i.test(msg)) {
        if (DEBUG) console.warn('[Credits API] user_payments not found, returning 0.');
        return jsonWithNoCache({
          success: true,
          credit: 0,
          payments: [],
          paymentCount: 0,
        });
      }
      console.error('[Credits API] Error loading payments:', paymentsError);
      return jsonWithNoCache(
        { error: 'Cannot read credit balance', details: msg },
        { status: 500 }
      );
    }

    const totalCredit = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;
    const paymentsWithDate = (payments ?? []).map((p) => ({
      ...p,
      date: p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : null,
    }));
    return jsonWithNoCache({
      success: true,
      credit: totalCredit,
      payments: paymentsWithDate,
      paymentCount: paymentsWithDate.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Credits API] Unexpected error:', message);
    return jsonWithNoCache({ error: 'Server error', details: message }, { status: 500 });
  }
}
