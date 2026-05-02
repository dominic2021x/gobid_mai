/**
 * GET /api/oblio/invoice-pdf?cif=&seriesName=&number=
 * Obține link PDF pentru o factură existentă din contul Oblio.
 * Se folosește când factura a fost deja creată și avem seriesName + number.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getOblioInvoiceLink,
  getOblioConfigFromEnv,
  type OblioConfig,
} from '@/modules/oblio';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function getOblioConfig(): OblioConfig | null {
  const fromEnv = getOblioConfigFromEnv();
  if (fromEnv?.clientId && fromEnv?.clientSecret) return fromEnv;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    let config: OblioConfig | null = getOblioConfig();

    if (!config && supabaseAdmin) {
      const { data: row, error } = await supabaseAdmin
        .from('admin_modules')
        .select('config, enabled')
        .eq('module_id', 'oblio')
        .maybeSingle();

      if (!error && row?.enabled === true && row?.config) {
        const c = (row.config || {}) as OblioConfig;
        if (c.clientId && c.clientSecret) config = c;
      }
    }

    if (!config?.clientId || !config.clientSecret) {
      return NextResponse.json(
        { success: false, message: 'Oblio nu este configurat.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cif = searchParams.get('cif') || config.cif;
    const seriesName = searchParams.get('seriesName') || 'FCT';
    const number = searchParams.get('number');

    if (!cif || !seriesName || !number) {
      return NextResponse.json(
        { success: false, message: 'Lipsesc parametrii: cif, seriesName sau number.' },
        { status: 400 }
      );
    }

    const link = await getOblioInvoiceLink(config, cif, seriesName, String(number));

    if (!link) {
      return NextResponse.json(
        { success: false, message: 'Factura nu a fost găsită în Oblio.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, link });
  } catch (error: unknown) {
    console.error('[Oblio invoice-pdf]', error);
    return NextResponse.json(
      { success: false, message: 'Eroare la obținerea PDF-ului.' },
      { status: 500 }
    );
  }
}
