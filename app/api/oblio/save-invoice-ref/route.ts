/**
 * POST /api/oblio/save-invoice-ref
 * Salvează referința Oblio (seriesName, number) în metadata plății (user_payments).
 * Body: { paymentId, oblioSeries, oblioNumber, cif }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getRequestAuthUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ success: false, message: 'Necesită autentificare.' }, { status: 401 });
    }
    const userId = sessionUser.id;

    const body = await request.json().catch(() => ({}));
    const { paymentId, oblioSeries, oblioNumber } = body;

    if (!paymentId || !oblioSeries || !oblioNumber) {
      return NextResponse.json(
        { success: false, message: 'Lipsesc: paymentId, oblioSeries sau oblioNumber.' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Eroare server.' }, { status: 500 });
    }

    const { data: payment, error: fetchErr } = await supabaseAdmin
      .from('user_payments')
      .select('id, user_id, metadata')
      .eq('id', paymentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !payment) {
      return NextResponse.json(
        { success: false, message: 'Plata nu a fost găsită.' },
        { status: 404 }
      );
    }

    const meta = (payment.metadata as Record<string, unknown>) || {};
    const updated = {
      ...meta,
      oblio_series: oblioSeries,
      oblio_number: String(oblioNumber),
    };

    const { error: updateErr } = await supabaseAdmin
      .from('user_payments')
      .update({ metadata: updated })
      .eq('id', paymentId)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[Oblio save-invoice-ref]', updateErr);
      return NextResponse.json(
        { success: false, message: 'Nu s-a putut salva referința.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Oblio save-invoice-ref]', error);
    return NextResponse.json(
      { success: false, message: 'Eroare la salvare.' },
      { status: 500 }
    );
  }
}
