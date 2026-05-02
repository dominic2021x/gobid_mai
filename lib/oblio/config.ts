/**
 * Oblio config: ENV first, then Admin → Module (admin_modules).
 * Used by lib/oblio client, createInvoice, and webhook.
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface OblioConfig {
  clientId: string;
  clientSecret: string;
  cif?: string;
  series?: string;
}

function fromEnv(): OblioConfig | null {
  const clientId = process.env.OBLIO_EMAIL ?? process.env.OBLIO_CLIENT_ID ?? '';
  const clientSecret = process.env.OBLIO_API_KEY ?? process.env.OBLIO_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    cif: process.env.OBLIO_CIF ?? undefined,
    series: process.env.OBLIO_SERIE ?? process.env.OBLIO_SERIE_NAME ?? 'FCT',
  };
}

/**
 * Returns Oblio config: 1) ENV vars, 2) Admin → Module (oblio, enabled).
 */
export async function getOblioConfig(): Promise<OblioConfig | null> {
  const env = fromEnv();
  if (env?.clientId && env.clientSecret) return env;

  if (!supabaseAdmin) return null;
  const { data: row, error } = await supabaseAdmin
    .from('admin_modules')
    .select('config, enabled')
    .eq('module_id', 'oblio')
    .maybeSingle();

  if (error || !row?.enabled || !row?.config || typeof row.config !== 'object') return null;
  const c = row.config as { clientId?: string; clientSecret?: string; cif?: string; seriesName?: string; series?: string };
  if (!c.clientId || !c.clientSecret) return null;
  return {
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    cif: c.cif ?? undefined,
    series: c.series ?? c.seriesName ?? 'FCT',
  };
}
