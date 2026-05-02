/**
 * Netopia payment webhook: on confirmed payment → create Oblio invoice, store PDF in Supabase, save metadata.
 * Idempotent: unique(order_id) prevents duplicate invoices.
 * maxDuration: 10s (Vercel).
 */

import { NextRequest } from 'next/server';
import { validateMobilPayIPN } from '@/lib/netopia-mobilpay';
import { getNetopiaConfig } from '@/lib/netopia-config';
import { createOblioInvoice } from '@/lib/oblio/createInvoice';
import { downloadOblioInvoicePdf } from '@/lib/oblio/downloadInvoice';
import { supabaseAdmin } from '@/lib/supabase';
import { paymentJson, paymentRaw } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 10;

const BUCKET = 'invoices';

type WebhookPayload = {
  orderId?: string;
  payment?: { status?: number };
  order?: { orderID?: string };
};

async function findPaymentByOrderId(orderId: string): Promise<{ id: string; user_id: string; amount: number; metadata: Record<string, unknown> } | null> {
  if (!supabaseAdmin) return null;
  const { data: rows, error } = await supabaseAdmin
    .from('user_payments')
    .select('id, user_id, amount, metadata')
    .limit(100);
  if (error || !rows?.length) return null;
  const row = rows.find(
    (r) =>
      (r.metadata as Record<string, unknown>)?.payment_intent_id === orderId ||
      (r.metadata as Record<string, unknown>)?.orderId === orderId
  );
  if (!row) return null;
  const amount = Number((row.metadata as Record<string, unknown>)?.amount ?? row.amount ?? 0);
  if (amount <= 0) return null;
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    amount,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

async function invoiceExists(orderId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle();
  return !error && data != null;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const intentFromQuery = request.nextUrl.searchParams.get('intent');
  const contentType = request.headers.get('content-type') ?? '';

  let orderId: string | null = null;
  let paymentConfirmed = false;

  let mobilPayResponseXml = '<?xml version="1.0" encoding="utf-8"?><crc>error</crc>';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    const env_key = formData.get('env_key')?.toString();
    const data = formData.get('data')?.toString();
    const iv = formData.get('iv')?.toString();
    const cipher = formData.get('cipher')?.toString();
    if (!env_key || !data) {
      return paymentRaw(mobilPayResponseXml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }
    const config = await getNetopiaConfig();
    if (!config.privateKey) {
      return paymentRaw(mobilPayResponseXml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }
    const validation = await validateMobilPayIPN(env_key, data, config.privateKey, { iv, cipher });
    mobilPayResponseXml = validation.responseXml ?? mobilPayResponseXml;
    paymentConfirmed = validation.success && (validation.action === 'confirmed' || validation.action === 'paid');
    orderId = validation.orderId ?? intentFromQuery;
  } else {
    let body: WebhookPayload;
    try {
      body = await request.json();
    } catch {
      return paymentJson({ errorCode: 1 }, { status: 400 });
    }
    const status = body?.payment?.status;
    paymentConfirmed = status === 3 || status === 5;
    orderId = body?.order?.orderID ?? body?.orderId ?? intentFromQuery;
  }

  if (!paymentConfirmed || !orderId) {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 2, message: 'Payment not confirmed or missing orderId' }, { status: 400 });
  }

  const payment = await findPaymentByOrderId(orderId);
  if (!payment) {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 0 });
  }

  const orderIdUuid = payment.id;
  if (await invoiceExists(orderIdUuid)) {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 0 });
  }

  await supabaseAdmin
    ?.from('user_payments')
    .update({
      amount: payment.amount,
      metadata: { ...payment.metadata, status: 'completed', ipn_at: new Date().toISOString() },
    })
    .eq('id', payment.id);

  const issueDate = formatDate(new Date());
  const dueDate = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const clientName = [payment.metadata.firstName, payment.metadata.lastName].filter(Boolean).join(' ') || 'Client';
  const clientEmail = (payment.metadata.email as string) ?? '';

  const createResult = await createOblioInvoice({
    client: { name: clientName, email: clientEmail || undefined },
    products: [{ name: (payment.metadata.description as string) || 'Plată servicii', price: payment.amount, quantity: 1 }],
    issueDate,
    dueDate,
    currency: 'RON',
    collect: { type: 'Card', value: payment.amount, issueDate },
  });

  if (!createResult.success) {
    console.error('[Netopia webhook] Oblio create failed:', createResult.message);
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 3, message: 'Invoice creation failed' }, { status: 500 });
  }

  const pdfResult = await downloadOblioInvoicePdf({ pdfLink: createResult.data.link });
  if (!pdfResult.success) {
    console.error('[Netopia webhook] PDF download failed:', pdfResult.message);
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 4, message: 'PDF download failed' }, { status: 500 });
  }

  const path = `${payment.user_id}/${orderIdUuid}.pdf`;
  const { error: uploadError } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(pdfResult.buffer), {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[Netopia webhook] Storage upload failed:', uploadError);
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 5, message: 'Upload failed' }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(path, 60);
  const pdfUrl = signed?.signedUrl ?? `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}.supabase.co/storage/v1/object/public/${BUCKET}/${path}`;

  const { error: insertError } = await supabaseAdmin!
    .from('invoices')
    .insert({
      user_id: payment.user_id,
      order_id: orderIdUuid,
      oblio_invoice_id: createResult.data.id,
      invoice_number: createResult.data.number,
      series: createResult.data.series,
      pdf_url: pdfUrl,
      amount: payment.amount,
      currency: 'RON',
      status: 'issued',
    });

  if (insertError) {
    console.error('[Netopia webhook] Invoice insert failed:', insertError);
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
    }
    return paymentJson({ errorCode: 6, message: 'DB insert failed' }, { status: 500 });
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return paymentRaw(mobilPayResponseXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
  return paymentJson({ errorCode: 0 });
}
