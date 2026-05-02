/**
 * Callback Netopia după plata creditelor (cumpărare credite Lei)
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { paymentRedirect } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    console.error('[Credits Callback] Supabase admin not available');
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
      return paymentRedirect(
        new URL('/dashboard/payments?error=missing_intent', request.url)
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('user_payments')
      .select('*')
      .eq('metadata->>payment_intent_id', intentId)
      .single();

    if (paymentError || !payment) {
      return paymentRedirect(
        new URL('/dashboard/payments?error=payment_not_found', request.url)
      );
    }

    if (status !== 'success') {
      await supabaseAdmin
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
        new URL(`/dashboard/payments?error=payment_${status || 'failed'}`, request.url)
      );
    }

    const metadata = payment.metadata as { amount?: number; credits?: number };
    const amountNum = Number(metadata?.amount) || 0;

    if (amountNum <= 0) {
      return paymentRedirect(
        new URL('/dashboard/payments?error=invalid_payment_data', request.url)
      );
    }

    await supabaseAdmin
      .from('user_payments')
      .update({
        amount: amountNum,
        description: `Cumpărare credite (${metadata?.credits ?? amountNum} credite) - plătit cu Netopia`,
        metadata: {
          ...(payment.metadata as Record<string, unknown>),
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
      })
      .eq('id', payment.id);

    return paymentRedirect(
      new URL(`/dashboard/payments?success=credits_purchased&amount=${amountNum}`, request.url)
    );
  } catch (error) {
    console.error('[Credits Callback] Error:', error);
    return paymentRedirect(
      new URL('/dashboard/payments?error=callback_error', request.url)
    );
  }
}
