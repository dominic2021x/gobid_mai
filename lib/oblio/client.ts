/**
 * Oblio API client – server-side only.
 * Config: ENV (OBLIO_EMAIL, OBLIO_API_KEY) sau Admin → Module (oblio).
 * Base URL: https://www.oblio.eu/api (sandbox and production use same URL).
 */

import { getOblioConfig } from './config';

const OBLIO_BASE = 'https://www.oblio.eu/api';

export type OblioFetchMethod = 'GET' | 'POST' | 'PUT';

/** Get Oblio Bearer token. Uses getOblioConfig() (ENV + Admin Module). */
export async function getOblioAccessToken(): Promise<string | null> {
  const config = await getOblioConfig();
  if (!config?.clientId || !config.clientSecret) return null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(`${OBLIO_BASE}/authorize/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/**
 * Authenticated fetch to Oblio API.
 * Uses Bearer token from OBLIO_EMAIL + OBLIO_API_KEY (OAuth).
 */
export async function oblioFetch<T = unknown>(
  endpoint: string,
  options?: { method?: OblioFetchMethod; body?: Record<string, unknown> }
): Promise<{ data: T; ok: true } | { ok: false; status: number; message: string }> {
  const token = await getOblioAccessToken();
  if (!token) {
    return { ok: false, status: 401, message: 'Oblio nu este configurat. Setează în .env sau Admin → Module → Oblio.' };
  }
  const method = options?.method ?? 'GET';
  const url = endpoint.startsWith('http') ? endpoint : `${OBLIO_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  };
  const res = await fetch(url, init);
  const raw = await res.text();
  let data: T;
  try {
    data = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return { ok: false, status: res.status, message: 'Invalid JSON response from Oblio' };
  }
  if (!res.ok) {
    const msg = (data as { statusMessage?: string })?.statusMessage ?? res.statusText;
    return { ok: false, status: res.status, message: msg };
  }
  return { data, ok: true };
}
