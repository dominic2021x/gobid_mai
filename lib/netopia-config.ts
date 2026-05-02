/**
 * Netopia Payments - Config helper
 * Citește configurația din admin_modules (testMode, keys) sau din variabile ENV.
 * Folosit de rutele de payment (credits, tokens, premium) pentru a determina
 * dacă se folosește mediul Sandbox sau Live.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { runPostgrestQuery, type PostgrestLikeError } from '@/lib/server/supabase/postgrest';

export type NetopiaEnv = 'sandbox' | 'live';

export interface NetopiaConfig {
  /** URL-ul de bază pentru redirect la plată */
  paymentUrl: string;
  /** Mediu: sandbox (test) sau live (producție) */
  env: NetopiaEnv;
  /** Mod test activ */
  testMode: boolean;
  /** API Key – opțional, doar pentru API v2 (netopia nu oferă întotdeauna) */
  apiKey?: string;
  /** Semnătura POS din Setări tehnice (ex: 3AQO-OWWT-C6KV-NLTZ-AUEI) */
  posSignature?: string;
  /** Cheie publică (.pem) – obligatorie pentru fluxul bazat pe certificate */
  publicKey?: string;
  /** Cheie privată (.pem) – obligatorie pentru fluxul bazat pe certificate și validare IPN */
  privateKey?: string;
  /** true dacă avem toate credentialele pentru flux certificate (fără API Key) */
  useCertificateFlow?: boolean;
}

export interface ResolvedNetopiaConfig {
  config: NetopiaConfig;
  source: "env" | "db" | "fallback";
  readError?: PostgrestLikeError | null;
}

/** URL-uri mobilPay (certificate flow) */
const DEFAULT_LIVE_URL = 'https://secure.mobilpay.ro';
const DEFAULT_SANDBOX_URL = 'https://sandboxsecure.mobilpay.ro';

function buildEnvOrDefaultNetopiaConfig(args: {
  envSandbox: boolean;
  envLiveUrl?: string;
  envSandboxUrl?: string;
  apiKeyTest?: string;
  posSigTest?: string;
  apiKeyLive?: string;
  posSigLive?: string;
}): NetopiaConfig {
  if (args.envSandbox) {
    return {
      paymentUrl: args.envSandboxUrl || DEFAULT_SANDBOX_URL,
      env: 'sandbox',
      testMode: true,
      apiKey: args.apiKeyTest || undefined,
      posSignature: args.posSigTest || undefined,
    };
  }

  return {
    paymentUrl: args.envLiveUrl || DEFAULT_LIVE_URL,
    env: 'live',
    testMode: false,
    apiKey: args.apiKeyLive || undefined,
    posSignature: args.posSigLive || undefined,
  };
}

/**
 * Obține configurația Netopia pentru plăți.
 * Prioritate: 1) admin_modules (testMode + URL override), 2) variabile ENV.
 */
export async function resolveNetopiaConfig(): Promise<ResolvedNetopiaConfig> {
  // 1. Verifică variabile ENV (rapid, fără DB)
  const envSandbox = process.env.NETOPIA_SANDBOX === 'true' || process.env.NETOPIA_SANDBOX === '1';
  const envLiveUrl = process.env.NETOPIA_PAYMENT_URL?.trim();
  const envSandboxUrl = process.env.NETOPIA_SANDBOX_URL?.trim();

  const apiKeyTest = process.env.NETOPIA_API_KEY_TEST?.trim() || process.env.NETOPIA_API_KEY?.trim();
  const posSigTest = process.env.NETOPIA_POS_SIGNATURE_TEST?.trim() || process.env.NETOPIA_POS_SIGNATURE?.trim();
  const apiKeyLive = process.env.NETOPIA_API_KEY_LIVE?.trim() || process.env.NETOPIA_API_KEY?.trim();
  const posSigLive = process.env.NETOPIA_POS_SIGNATURE_LIVE?.trim() || process.env.NETOPIA_POS_SIGNATURE?.trim();
  const fallbackConfig = buildEnvOrDefaultNetopiaConfig({
    envSandbox,
    envLiveUrl,
    envSandboxUrl,
    apiKeyTest,
    posSigTest,
    apiKeyLive,
    posSigLive,
  });

  if (envSandbox) {
    return { config: fallbackConfig, source: 'env' };
  }

  if (envLiveUrl && !envSandbox) {
    return { config: fallbackConfig, source: 'env' };
  }

  // 2. Încearcă admin_modules (config salvat în Admin → Module → Netopia)
  if (supabaseAdmin) {
    const adminClient = supabaseAdmin;
    const { data: row, error } = await runPostgrestQuery<{ config?: Record<string, unknown> | null }>(
      (signal) =>
        adminClient
          .from('admin_modules')
          .select('config')
          .eq('module_id', 'netopia')
          .abortSignal(signal)
          .maybeSingle(),
      { timeoutMs: 5000, maxRetries: 0 },
    );

    if (error) {
      return {
        config: fallbackConfig,
        source: 'fallback',
        readError: error,
      };
    }

    if (row?.config && typeof row.config === 'object') {
      const c = row.config as {
        testMode?: boolean;
        sandboxUrl?: string;
        paymentUrlLive?: string;
        apiKeyTest?: string;
        merchantSignatureTest?: string;
        apiKeyLive?: string;
        merchantSignatureLive?: string;
        publicKeyTest?: string;
        privateKeyTest?: string;
        publicKeyLive?: string;
        privateKeyLive?: string;
      };
      const testMode = Boolean(c.testMode);

      // Mod Test: credentiale Test (complet separate)
      if (testMode) {
        const posSigVal = c.merchantSignatureTest?.trim() || posSigTest;
        const sandboxUrl = c.sandboxUrl?.trim() || envSandboxUrl || DEFAULT_SANDBOX_URL;
        const apiKeyVal = c.apiKeyTest?.trim() || apiKeyTest;
        const pubKey = c.publicKeyTest?.trim();
        const privKey = c.privateKeyTest?.trim();
        const useCertificateFlow = Boolean(pubKey && privKey);
        return {
          config: {
            paymentUrl: sandboxUrl,
            env: 'sandbox',
            testMode: true,
            apiKey: apiKeyVal || undefined,
            posSignature: posSigVal || undefined,
            publicKey: pubKey || undefined,
            privateKey: privKey || undefined,
            useCertificateFlow,
          },
          source: 'db',
        };
      }

      // Mod Live: credentiale Live (complet separate)
      const posSigVal = c.merchantSignatureLive?.trim() || posSigLive;
      const liveUrl = c.paymentUrlLive?.trim() || envLiveUrl || DEFAULT_LIVE_URL;
      const apiKeyVal = c.apiKeyLive?.trim() || apiKeyLive;
      const pubKey = c.publicKeyLive?.trim();
      const privKey = c.privateKeyLive?.trim();
      const useCertificateFlow = Boolean(pubKey && privKey);
      return {
        config: {
          paymentUrl: liveUrl,
          env: 'live',
          testMode: false,
          apiKey: apiKeyVal || undefined,
          posSignature: posSigVal || undefined,
          publicKey: pubKey || undefined,
          privateKey: privKey || undefined,
          useCertificateFlow,
        },
        source: 'db',
      };
    }
  }

  // 3. Fallback: live cu URL default
  return {
    config: fallbackConfig,
    source: 'fallback',
  };
}

export async function getNetopiaConfig(): Promise<NetopiaConfig> {
  return (await resolveNetopiaConfig()).config;
}
