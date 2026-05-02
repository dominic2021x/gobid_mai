/**
 * Callback Netopia după plata pachetului de tokeni
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fulfillTokenPurchaseByIntentId } from '@/lib/tokens-payment-fulfill';
import { paymentRedirect } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    console.error('[Tokens Callback] Supabase admin not available');
    throw new Error('Supabase admin not configured.');
  }
  return supabaseAdmin;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get('intent');
    const status = searchParams.get('status');

    if (!intentId) {
      return paymentRedirect(new URL('/dashboard/tokens?error=missing_intent', request.url));
    }

    const supabase = getSupabaseAdmin();

    const { data: payment, error: paymentError } = await supabase
      .from('user_payments')
      .select('*')
      .eq('metadata->>payment_intent_id', intentId)
      .single();

    if (paymentError || !payment) {
      return paymentRedirect(new URL('/dashboard/tokens?error=payment_not_found', request.url));
    }

    if (status !== 'success') {
      await supabase
        .from('user_payments')
        .update({
          metadata: {
            ...(payment.metadata as Record<string, unknown>),
            status: status === 'canceled' ? 'canceled' : 'failed',
            failed_at: new Date().toISOString(),
          },
        })
        .eq('id', payment.id);

      return paymentRedirect(
        new URL(`/dashboard/tokens?error=payment_${status || 'failed'}`, request.url)
      );
    }

    const fulfill = await fulfillTokenPurchaseByIntentId(supabase, intentId);
    if (!fulfill.ok) {
      const code = fulfill.code;
      return paymentRedirect(new URL(`/dashboard/tokens?error=${code}`, request.url));
    }

    const meta = payment.metadata as { tokens?: number };
    const tokensAdded = Number(meta?.tokens) || 0;

    return paymentRedirect(
      new URL(`/dashboard/tokens?success=tokens_purchased&tokens=${tokensAdded}`, request.url)
    );
  } catch (error) {
    console.error('[Tokens Callback] Error:', error);
    return paymentRedirect(new URL('/dashboard/tokens?error=callback_error', request.url));
  }
}
