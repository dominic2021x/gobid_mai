/**
 * PayU Instant Payment Notification (IPN)
 * Primește notificări JSON de la PayU la schimbarea statusului comenzii.
 * Verifică OpenPayu-Signature, la status COMPLETED actualizează user_payments.
 */

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getPayUConfig } from '@/lib/payu-config';
import { paymentJson } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) return null;
  return supabaseAdmin;
}

/** Verifică semnătura OpenPayu-Signature: signature=MD5(JSON_body + second_key) */
function verifyPayUSignature(rawBody: string, signatureHeader: string | null, secondKey: string): boolean {
  if (!signatureHeader || !secondKey) return false;
  const match = signatureHeader.match(/signature=([^;]+)/);
  const incoming = match ? match[1].trim() : '';
  if (!incoming) return false;
  const payload = rawBody + secondKey;
  const expected = createHash('md5').update(payload).digest('hex');
  return expected === incoming;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('openpayu-signature');
    const config = await getPayUConfig();
    if (!config?.secondKey) {
      return paymentJson({ error: 'PayU not configured' }, { status: 200 });
    }
    if (!verifyPayUSignature(rawBody, signatureHeader, config.secondKey)) {
      console.warn('[PayU notify] Invalid signature');
      return paymentJson({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: { order?: { orderId?: string; extOrderId?: string; status?: string; totalAmount?: string; currencyCode?: string } };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return paymentJson({ error: 'Invalid JSON' }, { status: 400 });
    }

    const order = body?.order;
    const status = order?.status;
    const extOrderId = order?.extOrderId;
    if (!extOrderId) {
      return paymentJson({ error: 'Missing extOrderId' }, { status: 200 });
    }

    if (status !== 'COMPLETED') {
      return paymentJson({ received: true }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return paymentJson({ error: 'DB unavailable' }, { status: 200 });
    }

    const { data: row } = await supabase
      .from('user_payments')
      .select('id, metadata, amount')
      .eq('metadata->>payment_intent_id', extOrderId)
      .maybeSingle();

    if (!row) {
      return paymentJson({ received: true }, { status: 200 });
    }

    const meta = (row.metadata || {}) as Record<string, unknown>;
    if (meta.status === 'completed') {
      return paymentJson({ received: true }, { status: 200 });
    }

    const totalAmountStr = order?.totalAmount || '0';
    const totalAmountCents = parseInt(totalAmountStr, 10) || 0;
    const amountRon = totalAmountCents / 100;

    await supabase
      .from('user_payments')
      .update({
        amount: amountRon,
        metadata: {
          ...meta,
          status: 'completed',
          completed_at: new Date().toISOString(),
          payu_order_id: order?.orderId,
        },
      })
      .eq('id', row.id);

    return paymentJson({ received: true }, { status: 200 });
  } catch (e) {
    console.error('[PayU notify] Error:', e);
    return paymentJson({ error: 'Internal error' }, { status: 200 });
  }
}
