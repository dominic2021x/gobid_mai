/**
 * PayU Payments – OAuth + Create Order (API v2_1)
 * Docs: https://developers.payu.com/europe/docs/get-started/integration-overview/accept-payment/
 */

import type { PayUConfig } from './payu-config';

export interface PayUOrderParams {
  /** ID intern (ex: CREDIT-..., TKN-..., PREMIUM-...) – unic per POS */
  extOrderId: string;
  /** Suma în unități minime (RON: bani, deci 100 = 1 Lei) */
  totalAmount: string;
  /** Cod valutar: Lei, EUR, etc. */
  currencyCode: string;
  /** Descriere comandă */
  description: string;
  /** URL unde PayU trimite notificări de status */
  notifyUrl: string;
  /** URL unde utilizatorul e redirecționat după plată */
  continueUrl?: string;
  /** IP client (obligatoriu) */
  customerIp: string;
  /** Produse (minim unul); unitPrice în unități minime, quantity */
  products: Array<{ name: string; unitPrice: string; quantity: number }>;
  /** Opțional: date cumpărător */
  buyer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    language?: string;
  };
}

export interface PayUOrderResult {
  success: boolean;
  redirectUri?: string;
  orderId?: string;
  extOrderId?: string;
  message?: string;
  raw?: unknown;
}

const ORDERS_PATH = '/api/v2_1/orders';

/** Răspuns JSON de la PayU la create order (status poate avea statusCode și/sau statusDesc) */
export interface PayUOrderResponse {
  status?: { statusCode?: string; statusDesc?: string };
  redirectUri?: string;
  orderId?: string;
  extOrderId?: string;
  message?: string;
}

export interface PayUOAuthResult {
  token: string | null;
  error?: string;
  status?: number;
}

/**
 * Obține token OAuth (client_credentials) de la PayU.
 * Pentru România se folosește path /ro/standard/user/oauth/authorize (config.oauthPath).
 */
export async function getPayUOAuthToken(config: PayUConfig): Promise<string | null> {
  const result = await getPayUOAuthTokenWithError(config);
  return result.token;
}

export async function getPayUOAuthTokenWithError(config: PayUConfig): Promise<PayUOAuthResult> {
  const path = config.oauthPath?.startsWith('/') ? config.oauthPath : `/${config.oauthPath || 'ro/standard/user/oauth/authorize'}`;
  const url = `${config.apiUrl.replace(/\/$/, '')}${path}`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const text = await res.text();
  if (res.type === 'opaqueredirect' || res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
    const location = res.headers.get('location') || '';
    const errMsg = `PayU a returnat redirect (${res.status}) în loc de JSON. URL OAuth poate fi greșit. Location: ${location.slice(0, 80)}`;
    console.warn('[PayU] OAuth redirect:', res.status, url, location);
    return { token: null, error: errMsg, status: res.status };
  }
  if (!res.ok) {
    const errMsg = `PayU OAuth ${res.status}: ${text.slice(0, 200) || res.statusText}`;
    console.warn('[PayU] OAuth failed:', res.status, url, text.slice(0, 300));
    return { token: null, error: errMsg, status: res.status };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { token: null, error: 'PayU a returnat răspuns gol', status: res.status };
  }
  try {
    const data = JSON.parse(trimmed) as { access_token?: string };
    const token = data.access_token || null;
    return { token, status: res.status };
  } catch {
    const snippet = trimmed.slice(0, 150).replace(/\s+/g, ' ');
    console.warn('[PayU] OAuth response not JSON:', snippet);
    return {
      token: null,
      error: `Răspuns invalid de la PayU (nu e JSON). Primele caractere: ${snippet}${trimmed.length > 150 ? '...' : ''}`,
      status: res.status,
    };
  }
}

/**
 * Creează o comandă PayU și returnează redirectUri pentru redirecționarea utilizatorului.
 */
export async function createPayUOrder(
  config: PayUConfig,
  params: PayUOrderParams
): Promise<PayUOrderResult> {
  const oauthResult = await getPayUOAuthTokenWithError(config);
  if (!oauthResult.token) {
    return {
      success: false,
      message: oauthResult.error || 'Nu s-a putut obține token PayU',
      raw: oauthResult.status != null ? { httpStatus: oauthResult.status } : undefined,
    };
  }
  const token = oauthResult.token;

  const url = `${config.apiUrl.replace(/\/$/, '')}${ORDERS_PATH}`;
  const body = {
    merchantPosId: config.merchantPosId,
    customerIp: params.customerIp,
    description: params.description,
    currencyCode: params.currencyCode,
    totalAmount: params.totalAmount,
    extOrderId: params.extOrderId,
    notifyUrl: params.notifyUrl,
    ...(params.continueUrl && { continueUrl: params.continueUrl }),
    products: params.products,
    ...(params.buyer && Object.keys(params.buyer).length > 0 && { buyer: params.buyer }),
  };

  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });

  const text = await res.text();
  let data: PayUOrderResponse;
  try {
    data = (JSON.parse(text || '{}') || {}) as PayUOrderResponse;
  } catch {
    data = {};
  }

  const redirectFromHeader = res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308
    ? res.headers.get('location')
    : null;
  const redirectUri = data.redirectUri ?? (redirectFromHeader && redirectFromHeader.startsWith('http') ? redirectFromHeader : null);

  if (redirectUri) {
    return {
      success: true,
      redirectUri,
      orderId: data.orderId,
      extOrderId: data.extOrderId ?? params.extOrderId,
      raw: data,
    };
  }

  if (!res.ok) {
    const msg = data.status?.statusDesc ?? data.message ?? res.statusText ?? text.slice(0, 200);
    return { success: false, message: msg || 'Eroare la crearea comenzii PayU', raw: data };
  }

  return {
    success: false,
    message: 'PayU nu a returnat URL de redirect',
    raw: { ...data, httpStatus: res.status, bodyPreview: text.slice(0, 200) },
  };
}

/**
 * Convertește suma în Lei la unități minime (bani) pentru PayU.
 * 1 Lei = 100 bani => 2.99 Lei = 299
 */
export function ronToPayUAmount(ron: number): string {
  return String(Math.round(ron * 100));
}
