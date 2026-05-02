/**
 * GET /api/oblio/status
 * Returnează dacă Oblio este activ și configurat (fără a expune credențiale).
 * Folosit de dashboard pentru a afișa butoanele de factură Oblio.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOblioConfigFromEnv } from '@/modules/oblio';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET() {
  try {
    // 1. Verifică ENV
    const envConfig = getOblioConfigFromEnv();
    if (envConfig?.clientId && envConfig?.clientSecret) {
      return NextResponse.json({
        enabled: true,
        configured: true,
      });
    }

    // 2. Verifică admin_modules
    if (!supabaseAdmin) {
      return NextResponse.json({ enabled: false, configured: false });
    }

    const { data: row, error } = await supabaseAdmin
      .from('admin_modules')
      .select('enabled, config')
      .eq('module_id', 'oblio')
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ enabled: false, configured: false });
    }

    const config = (row.config || {}) as { clientId?: string; clientSecret?: string };
    const configured = !!(config.clientId && config.clientSecret);

    return NextResponse.json({
      enabled: !!row.enabled && configured,
      configured,
    });
  } catch {
    return NextResponse.json({ enabled: false, configured: false });
  }
}
