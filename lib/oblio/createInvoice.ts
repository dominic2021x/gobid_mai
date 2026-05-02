/**
 * Create invoice in Oblio via API.
 * CIF and series from getOblioConfig() (ENV or Admin → Module).
 * Oblio endpoint: POST /docs/invoice (official API path).
 */

import { oblioFetch } from './client';
import { getOblioConfig } from './config';

export interface OblioInvoiceClient {
  name: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  cif?: string;
  vatPayer?: boolean;
}

export interface OblioInvoiceProduct {
  name: string;
  price: number;
  quantity: number;
  measuringUnit?: string;
  vatName?: string;
  vatPercentage?: number;
  vatIncluded?: 0 | 1;
  code?: string;
  description?: string;
  productType?: string;
}

export interface CreateOblioInvoiceParams {
  client: OblioInvoiceClient;
  products: OblioInvoiceProduct[];
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  language?: string;
  currency?: string;
  collect?: { type: string; value?: number; issueDate?: string };
}

export interface CreateOblioInvoiceResult {
  id: string;
  number: string;
  series: string;
  link?: string;
}

function defaultProducts(amount: number, description: string): OblioInvoiceProduct[] {
  return [{
    name: description || 'Plată servicii',
    price: amount,
    quantity: 1,
    measuringUnit: 'buc',
    vatName: 'Normala',
    vatPercentage: 19,
    vatIncluded: 1,
    productType: 'Serviciu',
  }];
}

export async function createOblioInvoice(params: CreateOblioInvoiceParams): Promise<
  { success: true; data: CreateOblioInvoiceResult } | { success: false; message: string; status?: number }
> {
  const config = await getOblioConfig();
  if (!config?.clientId || !config.clientSecret) {
    return { success: false, message: 'Oblio nu este configurat. Setează în .env sau Admin → Module → Oblio.' };
  }
  const companyCif = config.cif ?? process.env.OBLIO_CIF ?? '';
  const seriesName = config.series ?? process.env.OBLIO_SERIE ?? process.env.OBLIO_SERIE_NAME ?? 'FCT';
  if (!companyCif) {
    return { success: false, message: 'CIF-ul firmei lipsește. Setează OBLIO_CIF sau CIF în Admin → Module → Oblio.' };
  }
  const products = params.products.length > 0
    ? params.products.map((p) => ({
        name: p.name,
        code: p.code ?? '',
        price: p.price,
        quantity: p.quantity ?? 1,
        measuringUnit: p.measuringUnit ?? 'buc',
        vatName: p.vatName ?? 'Normala',
        vatPercentage: p.vatPercentage ?? 19,
        vatIncluded: p.vatIncluded ?? 1,
        productType: p.productType ?? 'Serviciu',
        description: p.description,
      }))
    : defaultProducts(0, 'Plată servicii');

  const body = {
    cif: companyCif,
    seriesName,
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    language: params.language ?? 'RO',
    currency: params.currency ?? 'RON',
    precision: 2,
    client: {
      name: params.client.name,
      email: params.client.email,
      address: params.client.address,
      city: params.client.city ?? '',
      state: params.client.state,
      country: params.client.country ?? 'România',
      phone: params.client.phone,
      cif: params.client.cif,
      vatPayer: params.client.vatPayer ?? false,
    },
    products,
    ...(params.collect ? { collectDate: params.issueDate, collect: params.collect } : {}),
  };

  const result = await oblioFetch<{ status?: number; statusMessage?: string; data?: { seriesName?: string; number?: string; link?: string } }>(
    '/docs/invoice',
    { method: 'POST', body }
  );

  if (!result.ok) {
    return { success: false, message: result.message, status: result.status };
  }
  const d = result.data?.data;
  if (!d?.number) {
    return { success: false, message: 'Oblio did not return invoice number' };
  }
  return {
    success: true,
    data: {
      id: `${d.seriesName ?? seriesName}-${d.number}`,
      number: d.number,
      series: d.seriesName ?? seriesName,
      link: d.link,
    },
  };
}
