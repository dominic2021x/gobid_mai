/**
 * Download PDF for an existing Oblio invoice.
 * Option A: fetch from Oblio link (returned by create).
 * Option B: GET by cif + seriesName + number (Oblio view endpoint returns link, then we fetch PDF).
 */

import { getOblioAccessToken } from './client';
import { oblioFetch } from './client';

/**
 * Get PDF as Buffer from Oblio.
 * If pdfLink is provided (from create response), fetches that URL with Bearer token.
 * Otherwise uses GET /docs/invoice?cif=&seriesName=&number= to get link, then fetches PDF.
 */
export async function downloadOblioInvoicePdf(options: {
  pdfLink?: string;
  cif?: string;
  seriesName?: string;
  number?: string;
}): Promise<{ success: true; buffer: ArrayBuffer } | { success: false; message: string }> {
  let urlToFetch: string;

  if (options.pdfLink) {
    urlToFetch = options.pdfLink;
  } else if (options.cif && options.seriesName && options.number) {
    const view = await oblioFetch<{ data?: { link?: string } }>(
      `/docs/invoice?cif=${encodeURIComponent(options.cif)}&seriesName=${encodeURIComponent(options.seriesName)}&number=${encodeURIComponent(options.number)}`
    );
    if (!view.ok || !view.data?.data?.link) {
      return { success: false, message: view.ok ? 'No PDF link in response' : view.message };
    }
    urlToFetch = view.data.data.link;
  } else {
    return { success: false, message: 'Provide pdfLink or (cif, seriesName, number)' };
  }

  const token = await getOblioAccessToken();
  if (!token) return { success: false, message: 'Oblio credentials missing' };

  const res = await fetch(urlToFetch, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { success: false, message: `PDF fetch failed: ${res.status}` };
  }
  const buffer = await res.arrayBuffer();
  return { success: true, buffer };
}
