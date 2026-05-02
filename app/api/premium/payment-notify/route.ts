/**
 * IPN Netopia / mobilPay pentru promovare premium
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateMobilPayIPN } from '@/lib/netopia-mobilpay';
import { getNetopiaConfig } from '@/lib/netopia-config';
import { fulfillPremiumByIntentId } from '@/lib/premium-payment-fulfill';
import { paymentJson, paymentRaw } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
  try {
    const intentFromQuery = request.nextUrl.searchParams.get('intent');
    if (!supabaseAdmin) {
      return paymentRaw('', { status: 400 });
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const env_key = formData.get('env_key')?.toString();
      const data = formData.get('data')?.toString();
      const iv = formData.get('iv')?.toString();
      const cipher = formData.get('cipher')?.toString();

      if (!env_key || !data) {
        return paymentRaw('<?xml version="1.0" encoding="utf-8"?><crc>error</crc>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      const config = await getNetopiaConfig();
      if (!config.privateKey) {
        return paymentRaw('<?xml version="1.0" encoding="utf-8"?><crc>error</crc>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      const validation = await validateMobilPayIPN(env_key, data, config.privateKey, { iv, cipher });

      if (validation.success && validation.action) {
        const orderId = validation.orderId || intentFromQuery || '';
        if (orderId && orderId.startsWith('PREMIUM-')) {
          await fulfillPremiumByIntentId(supabaseAdmin, orderId);
        }
      }

      const xml = validation.responseXml || '<?xml version="1.0" encoding="utf-8"?><crc>error</crc>';
      return paymentRaw(xml, {
        status: 200,
        headers: { 'Content-Type': validation.contentType || 'application/xml' },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return paymentJson({ errorCode: 1 }, { status: 400 });
    }

    const payload = body as { order?: { orderID?: string }; payment?: { status?: number } };
    const orderId = payload?.order?.orderID || intentFromQuery || '';
    const paymentStatus = payload?.payment?.status;

    if ((paymentStatus === 3 || paymentStatus === 5) && orderId && orderId.startsWith('PREMIUM-')) {
      await fulfillPremiumByIntentId(supabaseAdmin, orderId);
    }

    return paymentJson({ errorCode: 0 });
  } catch {
    return paymentRaw('', { status: 400 });
  }
}
