/**
 * List invoices for the authenticated user.
 * GET /api/user/invoices
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  series: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authUser = await getRequestAuthUser(request);
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = authUser.id;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, series, amount, currency, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }

  const invoices: InvoiceRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    invoice_number: r.invoice_number as string | null,
    series: r.series as string | null,
    amount: Number(r.amount),
    currency: (r.currency as string) ?? 'RON',
    status: (r.status as string) ?? 'issued',
    created_at: (r.created_at as string) ?? '',
  }));

  return NextResponse.json({ invoices });
}
