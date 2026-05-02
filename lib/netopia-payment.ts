/**
 * Netopia Payments – apel direct la API /payment/card/start
 * Necesită: API Key (Profile → Security), posSignature (Semnătura POS)
 * Docs: https://doc.netopia-payments.com/docs/payment-api/v2.x/start/start-payment
 */

import type { NetopiaConfig } from './netopia-config';

const LIVE_START_URL = 'https://secure.mobilpay.ro/pay/payment/card/start';
const SANDBOX_START_URL = 'https://secure.sandbox.netopia-payments.com/payment/card/start';

const NETOPIA_DEBUG = process.env.NETOPIA_DEBUG === '1' || process.env.NETOPIA_DEBUG === 'true';

function isLikelyNetopiaHostedUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return h.includes('mobilpay') || h.includes('netopia');
  } catch {
    return /^https?:\/\//i.test(value);
  }
}

function pickHostedUrlFromRecord(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && isLikelyNetopiaHostedUrl(v)) return v;
  }
  return undefined;
}

/**
 * Netopia JSON uses mixed casing / nesting across API versions; collect every common shape.
 */
export function extractNetopiaRedirectUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const root = data as Record<string, unknown>;

  const direct = pickHostedUrlFromRecord(root, [
    'paymentURL',
    'paymentUrl',
    'payment_url',
    'redirectUrl',
    'redirect_url',
    'redirectURL',
    'url',
  ]);
  if (direct) return direct;

  const payment = root.payment;
  if (payment && typeof payment === 'object') {
    const p = payment as Record<string, unknown>;
    const fromPayment = pickHostedUrlFromRecord(p, [
      'paymentURL',
      'paymentUrl',
      'payment_url',
      'redirectUrl',
      'url',
    ]);
    if (fromPayment) return fromPayment;
  }

  const customerAction = root.customerAction;
  if (customerAction && typeof customerAction === 'object') {
    const ca = customerAction as Record<string, unknown>;
    const u = ca.url;
    if (typeof u === 'string' && isLikelyNetopiaHostedUrl(u)) return u;
  }

  for (const v of Object.values(root)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = pickHostedUrlFromRecord(v as Record<string, unknown>, [
        'paymentURL',
        'paymentUrl',
        'payment_url',
        'url',
      ]);
      if (nested) return nested;
    }
  }

  return undefined;
}

export interface NetopiaStartPaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  description: string;
  redirectUrl: string;
  notifyUrl: string;
  billing: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    country?: number;
    countryName?: string;
  };
  browserData?: Record<string, string | number | boolean>;
}

export interface NetopiaStartPaymentResult {
  success: boolean;
  paymentURL?: string;
  errorCode?: string;
  message?: string;
  raw?: unknown;
}

/**
 * Inițiază o plată prin API-ul Netopia și returnează URL-ul de redirect.
 */
export async function startNetopiaPayment(
  config: NetopiaConfig,
  params: NetopiaStartPaymentParams
): Promise<NetopiaStartPaymentResult> {
  const { apiKey, posSignature, testMode } = config;

  if (!apiKey || !posSignature) {
    return {
      success: false,
      message: 'Configurație Netopia incompletă: API Key și Semnătura POS sunt obligatorii. Setează-le în Admin → Module → Netopia.',
    };
  }

  const baseUrl = testMode ? SANDBOX_START_URL : LIVE_START_URL;
  const b = params.billing;

  const payload = {
    config: {
      notifyUrl: params.notifyUrl,
      redirectUrl: params.redirectUrl,
      language: 'ro',
    },
    payment: {
      options: { installments: 0, bonus: 0 },
      instrument: { type: 'card' },
      data: params.browserData || {},
    },
    order: {
      posSignature: posSignature,
      dateTime: new Date().toISOString(),
      description: params.description,
      orderID: params.orderId,
      amount: params.amount,
      currency: params.currency || 'RON',
      billing: {
        email: b.email,
        phone: b.phone || '',
        firstName: b.firstName || '',
        lastName: b.lastName || '',
        city: b.city || '',
        country: b.country ?? 642,
        countryName: b.countryName || 'Romania',
        state: '',
        postalCode: '',
        details: '',
      },
    },
  };

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        if (NETOPIA_DEBUG) {
          console.warn('[Netopia] Non-JSON response from /payment/card/start:', rawText.slice(0, 500));
        }
        return {
          success: false,
          errorCode: String(res.status),
          message: `Răspuns non-JSON de la Netopia (HTTP ${res.status})`,
          raw: rawText.slice(0, 2000),
        };
      }
    }

    if (!res.ok) {
      if (NETOPIA_DEBUG) {
        console.warn('[Netopia] start failed HTTP', res.status, JSON.stringify(data).slice(0, 2000));
      }
      return {
        success: false,
        errorCode: String(data?.errorCode ?? res.status),
        message: (data?.message as string) || `HTTP ${res.status}`,
        raw: data,
      };
    }

    const paymentURL = extractNetopiaRedirectUrl(data);

    if (paymentURL) {
      return { success: true, paymentURL, raw: data };
    }

    if (NETOPIA_DEBUG) {
      console.warn('[Netopia] No redirect URL in OK response keys:', Object.keys(data), JSON.stringify(data).slice(0, 2000));
    }

    const err = data?.error as Record<string, unknown> | undefined;
    const errCode = String(data?.errorCode ?? data?.code ?? err?.code ?? '');
    const errMsg =
      (data?.message as string) ||
      (err?.message as string) ||
      (typeof err?.message === 'string' ? err.message : null) ||
      'Răspuns necunoscut de la Netopia (lipsește URL plată)';
    return {
      success: false,
      errorCode: errCode || 'unknown',
      message: errMsg,
      raw: data,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Eroare la comunicarea cu Netopia',
    };
  }
}
