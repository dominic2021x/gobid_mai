/**
 * PayU Payments – Config helper
 * Citește configurația din admin_modules (payu) sau din variabile ENV.
 * Folosit opțional pentru plăți card prin PayU. Pe gobid.ro metoda principală este Netopia.
 */

import { supabaseAdmin } from '@/lib/supabase';

export type PayUEnv = 'sandbox' | 'live';

export interface PayUConfig {
  /** URL API (secure.payu.com sau secure.snd.payu.com) */
  apiUrl: string;
  /** Path OAuth (ex: /ro/standard/user/oauth/authorize pentru România, /pl/ pentru Polonia) */
  oauthPath: string;
  /** Mediu: sandbox (test) sau live (producție) */
  env: PayUEnv;
  /** Mod test activ */
  testMode: boolean;
  /** OAuth client_id (din POS / Management Panel) */
  clientId: string;
  /** OAuth client_secret */
  clientSecret: string;
  /** Merchant POS ID (merchantPosId pentru orders) */
  merchantPosId: string;
  /** Second key pentru validarea semnăturii notificărilor (OpenPayu-Signature) – poate fi același cu client_secret sau separat */
  secondKey?: string;
}

const DEFAULT_LIVE_URL = 'https://secure.payu.com';
const DEFAULT_LIVE_URL_RO = 'https://secure.payu.ro';
const DEFAULT_SANDBOX_URL = 'https://secure.snd.payu.com';

/**
 * Obține configurația PayU pentru plăți.
 * Prioritate: 1) admin_modules (module_id = 'payu'), 2) variabile ENV.
 */
export async function getPayUConfig(): Promise<PayUConfig | null> {
  const sandboxRaw = process.env.PAYU_SANDBOX?.trim().toLowerCase().split(/#|\s/)[0];
  const envSandbox = sandboxRaw === 'true' || sandboxRaw === '1';
  const envClientId = process.env.PAYU_CLIENT_ID?.trim();
  const envClientSecret = process.env.PAYU_CLIENT_SECRET?.trim();
  const envPosId = process.env.PAYU_MERCHANT_POS_ID?.trim();
  const envSecondKey = process.env.PAYU_SECOND_KEY?.trim();

  if (envClientId && envClientSecret && envPosId) {
    const oauthPath = process.env.PAYU_OAUTH_PATH?.trim() || '/pl/standard/user/oauth/authorize';
    const liveUrl = process.env.PAYU_API_URL?.trim() || DEFAULT_LIVE_URL;
    return {
      apiUrl: envSandbox ? (process.env.PAYU_SANDBOX_URL?.trim() || DEFAULT_SANDBOX_URL) : liveUrl,
      oauthPath: oauthPath.startsWith('/') ? oauthPath : `/${oauthPath}`,
      env: envSandbox ? 'sandbox' : 'live',
      testMode: envSandbox,
      clientId: envClientId,
      clientSecret: envClientSecret,
      merchantPosId: envPosId,
      secondKey: envSecondKey || envClientSecret,
    };
  }

  if (supabaseAdmin) {
    try {
      const { data: row, error } = await supabaseAdmin
        .from('admin_modules')
        .select('config')
        .eq('module_id', 'payu')
        .maybeSingle();

      if (!error && row?.config && typeof row.config === 'object') {
        const c = row.config as {
          testMode?: boolean;
          clientIdTest?: string;
          clientSecretTest?: string;
          merchantPosIdTest?: string;
          clientIdLive?: string;
          clientSecretLive?: string;
          merchantPosIdLive?: string;
          secondKeyTest?: string;
          secondKeyLive?: string;
        };
        const testMode = Boolean(c.testMode);
        if (testMode) {
          const clientId = c.clientIdTest?.trim();
          const clientSecret = c.clientSecretTest?.trim();
          const posId = c.merchantPosIdTest?.trim();
          if (clientId && clientSecret && posId) {
            const oauthPath = (c as { oauthPath?: string }).oauthPath?.trim() || '/ro/standard/user/oauth/authorize';
            return {
              apiUrl: DEFAULT_SANDBOX_URL,
              oauthPath: oauthPath.startsWith('/') ? oauthPath : `/${oauthPath}`,
              env: 'sandbox',
              testMode: true,
              clientId,
              clientSecret,
              merchantPosId: posId,
              secondKey: c.secondKeyTest?.trim() || clientSecret,
            };
          }
        } else {
          const clientId = c.clientIdLive?.trim();
          const clientSecret = c.clientSecretLive?.trim();
          const posId = c.merchantPosIdLive?.trim();
          if (clientId && clientSecret && posId) {
            const oauthPath = (c as { oauthPath?: string }).oauthPath?.trim() || '/ro/standard/user/oauth/authorize';
            return {
              apiUrl: DEFAULT_LIVE_URL,
              oauthPath: oauthPath.startsWith('/') ? oauthPath : `/${oauthPath}`,
              env: 'live',
              testMode: false,
              clientId,
              clientSecret,
              merchantPosId: posId,
              secondKey: c.secondKeyLive?.trim() || clientSecret,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[payu-config] Error reading admin_modules:', err);
    }
  }

  return null;
}
