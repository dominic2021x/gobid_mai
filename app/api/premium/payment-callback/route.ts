/**
 * API Route pentru callback-ul de la Netopia după plată (premium)
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fulfillPremiumByIntentId } from '@/lib/premium-payment-fulfill';
import { paymentRedirect } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    console.error('[Premium Payment Callback] Supabase admin client not available');
    throw new Error('Supabase admin client not configured.');
  }
  return supabaseAdmin;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get('intent');
    const status = searchParams.get('status');

    if (!intentId) {
      return paymentRedirect(new URL('/dashboard/my-products?error=missing_intent', request.url));
    }

    const supabase = getSupabaseAdmin();

    const { data: payment, error: paymentError } = await supabase
      .from('user_payments')
      .select('*')
      .eq('metadata->>payment_intent_id', intentId)
      .single();

    if (paymentError || !payment) {
      return paymentRedirect(new URL('/dashboard/my-products?error=payment_not_found', request.url));
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
        new URL(`/dashboard/my-products?error=payment_${status || 'failed'}`, request.url)
      );
    }

    const fulfill = await fulfillPremiumByIntentId(supabase, intentId);
    if (!fulfill.ok) {
      return paymentRedirect(
        new URL(`/dashboard/my-products?error=${fulfill.code}`, request.url)
      );
    }

    const metadata = payment.metadata as { weeks?: number };
    const weeks = metadata.weeks ?? 0;

    return paymentRedirect(
      new URL(`/dashboard/my-products?success=premium_activated&weeks=${weeks}`, request.url)
    );
  } catch (error: unknown) {
    console.error('Error in payment callback:', error);
    return paymentRedirect(new URL('/dashboard/my-products?error=callback_error', request.url));
  }
}
