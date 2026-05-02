/**
 * Secure invoice download: validate user, return redirect to signed Supabase Storage URL (60s).
 * GET /api/user/invoices/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const BUCKET = 'invoices';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authUser = await getRequestAuthUser(request);
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = authUser.id;

  const { id: invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, user_id, order_id, pdf_url')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const path = `${invoice.user_id}/${invoice.order_id}.pdf`;
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (signError || !signed?.signedUrl) {
    if (invoice.pdf_url) {
      return NextResponse.redirect(invoice.pdf_url, { status: 302 });
    }
    return NextResponse.json({ error: 'Download unavailable' }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
