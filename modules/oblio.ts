/**
 * Oblio.eu API Integration Service
 * Documentație: https://www.oblio.eu/api
 * Autorizare OAuth 2.0: client_id (email) + client_secret (token din Setări > Date Cont)
 */

const OBLIO_BASE = 'https://www.oblio.eu/api';

export interface OblioConfig {
  clientId: string;      // Email cont Oblio
  clientSecret: string; // Token din Setări > Date Cont
  cif?: string;         // CIF firma (opțional, se poate lua din nomenclator)
}

export interface OblioClient {
  cif?: string;
  name: string;
  rc?: string;
  code?: string;
  address?: string;
  state?: string;
  city?: string;
  country?: string;
  iban?: string;
  bank?: string;
  email?: string;
  phone?: string;
  contact?: string;
  vatPayer?: boolean;
}

export interface OblioProduct {
  name: string;
  code?: string;
  description?: string;
  price: number;
  measuringUnit?: string;
  currency?: string;
  vatName?: string;
  vatPercentage?: number;
  vatIncluded?: 0 | 1;
  quantity?: number;
  productType?: string;
}

export interface OblioInvoice {
  cif: string;
  client: OblioClient;
  issueDate: string;   // YYYY-MM-DD
  dueDate: string;     // YYYY-MM-DD
  seriesName: string;  // ex: FCT
  language?: string;   // RO, EN, etc.
  precision?: number;  // 2-4
  currency?: string;   // RON
  exchangeRate?: number;
  products: OblioProduct[];
  deliveryDate?: string;
  collectDate?: string;
  collect?: {
    type: string;      // "Card", "Ordin de plata", etc.
    documentNumber?: string;
    value?: number;
    issueDate?: string;
  };
  /** 1 = Oblio trimite factura pe email la client (Setări > E-mail-uri alarma > Document prin email) */
  sendEmail?: 0 | 1;
}

export interface OblioTokenResponse {
  access_token: string;
  expires_in: string;
  token_type: string;
  scope?: string;
  request_time?: string;
}

export interface OblioApiResponse<T = unknown> {
  status: number;
  statusMessage: string;
  data?: T;
}

export interface OblioInvoiceResult {
  seriesName: string;
  number: string;
  link: string;  // URL PDF
}

/**
 * Citește config Oblio din variabile de mediu (.env).
 * Folosit server-side (API routes). Nu expune secretul către client.
 */
export function getOblioConfigFromEnv(): OblioConfig | null {
  const clientId = process.env.OBLIO_CLIENT_ID || process.env.NEXT_PUBLIC_OBLIO_CLIENT_ID || '';
  const clientSecret = process.env.OBLIO_CLIENT_SECRET || '';
  const cif = process.env.OBLIO_CIF || '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, cif: cif || undefined };
}

/**
 * Obține token de acces Oblio (server-side sau client cu proxy)
 */
export async function getOblioAccessToken(config: OblioConfig): Promise<string | null> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(`${OBLIO_BASE}/authorize/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Oblio token error:', res.status, text);
    return null;
  }

  const data = (await res.json()) as OblioTokenResponse;
  return data.access_token || null;
}

/**
 * Test conexiune: token + lista companii
 */
export async function testOblioConnection(config: OblioConfig): Promise<{
  success: boolean;
  message: string;
  companies?: { cif: string; company: string }[];
}> {
  if (!config.clientId || !config.clientSecret) {
    return { success: false, message: 'Completează email-ul și token-ul Oblio (Setări > Date Cont).' };
  }

  const token = await getOblioAccessToken(config);
  if (!token) {
    return { success: false, message: 'Nu s-a putut obține token-ul. Verifică email-ul și token-ul (client_secret).' };
  }

  const companiesRes = await fetch(`${OBLIO_BASE}/nomenclature/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!companiesRes.ok) {
    return {
      success: true,
      message: 'Autentificare reușită. Nu s-a putut încărca lista de companii.',
    };
  }

  const companiesData = (await companiesRes.json()) as OblioApiResponse<{ cif: string; company: string }[]>;
  const companies = companiesData.data || [];

  return {
    success: true,
    message: `Conexiune Oblio OK. ${companies.length} companii găsite.`,
    companies,
  };
}

/**
 * Creează factură în Oblio
 */
export async function createOblioInvoice(
  config: OblioConfig,
  invoice: OblioInvoice
): Promise<OblioApiResponse<OblioInvoiceResult>> {
  const token = await getOblioAccessToken(config);
  if (!token) {
    return { status: 401, statusMessage: 'Token Oblio invalid sau expirat.' };
  }

  const res = await fetch(`${OBLIO_BASE}/docs/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(invoice),
  });

  const data = (await res.json()) as OblioApiResponse<OblioInvoiceResult>;
  if (!res.ok) {
    return {
      status: res.status,
      statusMessage: (data as any).statusMessage || data.statusMessage || `Eroare ${res.status}`,
      data: data.data,
    };
  }
  return data;
}

/**
 * Obține link PDF pentru factură existentă
 */
export async function getOblioInvoiceLink(
  config: OblioConfig,
  cif: string,
  seriesName: string,
  number: string
): Promise<string | null> {
  const token = await getOblioAccessToken(config);
  if (!token) return null;

  const params = new URLSearchParams({ cif, seriesName, number });
  const res = await fetch(`${OBLIO_BASE}/docs/invoice?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = (await res.json()) as OblioApiResponse<{ link: string }>;
  return data.data?.link ?? null;
}

/**
 * Helper: construiește payload factură Oblio din date plată (similar createSmartBillInvoiceFromPayment)
 */
export function createOblioInvoiceFromPayment(
  payment: {
    date?: string;
    dueDate?: string;
    currency?: string;
    total?: number;
    amount?: number;
    description?: string;
    status?: string;
    items?: Array<{ name?: string; description?: string; quantity?: number; price?: number; amount?: number; unit?: string; vatPercentage?: number }>;
  },
  clientInfo: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    address?: string;
    city?: string;
    county?: string;
    country?: string;
    phone?: string;
    vatCode?: string;
    cui?: string;
  },
  cif: string,
  seriesName: string = 'FCT'
): OblioInvoice {
  const today = new Date().toISOString().split('T')[0];
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const dueDateStr = due.toISOString().split('T')[0];

  const client: OblioClient = {
    name: clientInfo.name || `${clientInfo.firstName || ''} ${clientInfo.lastName || ''}`.trim() || 'Client',
    email: clientInfo.email,
    address: clientInfo.address,
    city: clientInfo.city || '',
    state: clientInfo.county || '',
    country: clientInfo.country || 'România',
    phone: clientInfo.phone,
    cif: clientInfo.vatCode || clientInfo.cui || undefined,
    vatPayer: !!(clientInfo.vatCode || clientInfo.cui),
  };

  const products: OblioProduct[] = [];

  if (payment.items && Array.isArray(payment.items) && payment.items.length > 0) {
    payment.items.forEach((item) => {
      products.push({
        name: item.name || item.description || 'Serviciu',
        code: '',
        price: item.price ?? item.amount ?? 0,
        measuringUnit: (item as any).unit || 'buc',
        vatName: 'Normala',
        vatPercentage: item.vatPercentage ?? 19,
        vatIncluded: 1,
        quantity: item.quantity ?? 1,
        productType: 'Serviciu',
      });
    });
  } else {
    products.push({
      name: payment.description || 'Plată servicii',
      price: payment.total ?? payment.amount ?? 0,
      measuringUnit: 'buc',
      vatName: 'Normala',
      vatPercentage: 19,
      vatIncluded: 1,
      quantity: 1,
      productType: 'Serviciu',
    });
  }

  const issueDate = payment.date || today;
  const dueDate = (payment as any).dueDate || dueDateStr;

  const payload: OblioInvoice = {
    cif,
    client,
    issueDate,
    dueDate,
    seriesName,
    language: 'RO',
    precision: 2,
    currency: payment.currency || 'RON',
    products,
  };

  if (payment.status === 'paid') {
    payload.collectDate = issueDate;
    payload.collect = {
      type: 'Card',
      issueDate,
      value: payment.total ?? payment.amount,
    };
  }

  return payload;
}
