/**
 * IPN (Instant Payment Notification) de la Netopia / mobilPay
 * Suportă: 1) mobilPay (certificate) – form-urlencoded cu env_key, data
 *          2) API v2 – JSON cu order.orderID, payment.status
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateMobilPayIPN } from '@/lib/netopia-mobilpay';
import { getNetopiaConfig } from '@/lib/netopia-config';
import { paymentJson, paymentRaw } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function markPaymentCompleted(orderId: string) {
  if (!supabaseAdmin) return;
  const { data: row } = await supabaseAdmin
    .from('user_payments')
    .select('id, metadata')
    .eq('metadata->>payment_intent_id', orderId)
    .maybeSingle();

  if (!row) return;
  const meta = row.metadata as Record<string, unknown>;
  const amount = Number(meta?.amount);
  if (amount <= 0) return;

  await supabaseAdmin
    .from('user_payments')
    .update({
      amount,
      metadata: {
        ...meta,
        status: 'completed',
        ipn_at: new Date().toISOString(),
      },
    })
    .eq('id', row.id);
}

export async function POST(request: NextRequest) {
  try {
    const intentId = request.nextUrl.searchParams.get('intent');
    if (!supabaseAdmin) {
      return paymentRaw('', { status: 400 });
    }

    const contentType = request.headers.get('content-type') || '';

    // mobilPay (certificate): application/x-www-form-urlencoded cu env_key, data, iv?, cipher?
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const env_key = formData.get('env_key')?.toString();
      const data = formData.get('data')?.toString();
      const iv = formData.get('iv')?.toString();
      const cipher = formData.get('cipher')?.toString();

      if (!env_key || !data) {
        return paymentRaw('<?xml version="1.0" encoding="utf-8"?><crc>error</crc>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      const config = await getNetopiaConfig();
      if (!config.privateKey) {
        return paymentRaw('<?xml version="1.0" encoding="utf-8"?><crc>error</crc>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      const validation = await validateMobilPayIPN(env_key, data, config.privateKey, { iv, cipher });

      if (validation.success && validation.action) {
        const orderId = validation.orderId || intentId;
        if (orderId) await markPaymentCompleted(orderId);
      }

      const xml = validation.responseXml || '<?xml version="1.0" encoding="utf-8"?><crc>error</crc>';
      return paymentRaw(xml, {
        status: 200,
        headers: { 'Content-Type': validation.contentType || 'application/xml' },
      });
    }

    // API v2: JSON
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return paymentJson({ errorCode: 1 }, { status: 400 });
    }

    const payload = body as { order?: { orderID?: string }; payment?: { status?: number } };
    const orderId = payload?.order?.orderID || intentId || '';
    const paymentStatus = payload?.payment?.status;

    if ((paymentStatus === 3 || paymentStatus === 5) && orderId) {
      await markPaymentCompleted(orderId);
    }

    return paymentJson({ errorCode: 0 });
  } catch {
    return paymentRaw('', { status: 400 });
  }
}
