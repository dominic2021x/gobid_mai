/**
 * Creează factură Oblio din date plată + client.
 * POST /api/oblio/create-invoice
 * Config: 1) variabile ENV (OBLIO_CLIENT_ID, OBLIO_CLIENT_SECRET, OBLIO_CIF), 2) Supabase admin_modules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  createOblioInvoice,
  createOblioInvoiceFromPayment,
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

export async function POST(request: NextRequest) {
  try {
    let config: OblioConfig | null = getOblioConfig();

    if (!config && supabaseAdmin) {
      const { data: row, error } = await supabaseAdmin
        .from('admin_modules')
        .select('config, enabled')
        .eq('module_id', 'oblio')
        .maybeSingle();

      // Folosește config din Admin doar dacă modulul e ACTIVAT
      if (!error && row?.enabled === true && row?.config) {
        const c = (row.config || {}) as OblioConfig;
        if (c.clientId && c.clientSecret) config = c;
      }
    }

    if (!config || !config.clientId || !config.clientSecret) {
      return NextResponse.json(
        { success: false, message: 'Oblio nu este configurat. Setează OBLIO_CLIENT_ID și OBLIO_CLIENT_SECRET în .env sau configurează în Admin → Module.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { payment, clientInfo, cif: cifOverride, seriesName, sendEmail } = body;

    if (!payment || !clientInfo) {
      return NextResponse.json(
        { success: false, message: 'Lipsesc payment sau clientInfo în body.' },
        { status: 400 }
      );
    }

    const cif = cifOverride || config.cif;
    if (!cif) {
      return NextResponse.json(
        { success: false, message: 'CIF-ul firmei lipsește. Setează-l în configurația Oblio sau trimite cif în body.' },
        { status: 400 }
      );
    }

    const series = seriesName || 'FCT';
    const invoicePayload = createOblioInvoiceFromPayment(
      payment,
      clientInfo,
      cif,
      series
    );
    // Template + email: Oblio generează PDF-ul și îl trimite la client.email dacă sendEmail este 1
    invoicePayload.sendEmail = sendEmail === false ? 0 : 1;

    const result = await createOblioInvoice(config, invoicePayload);

    if (result.status !== 200 || !result.data) {
      return NextResponse.json(
        {
          success: false,
          message: result.statusMessage || 'Eroare la crearea facturii Oblio.',
          details: result.data,
        },
        { status: result.status >= 400 ? result.status : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      link: result.data.link,
      number: result.data.number,
      seriesName: result.data.seriesName,
    });
  } catch (error: any) {
    console.error('Error in /api/oblio/create-invoice:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Eroare la crearea facturii.',
      },
      { status: 500 }
    );
  }
}
