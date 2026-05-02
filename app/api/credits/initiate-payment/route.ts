/**
 * API Route pentru inițierea plății credite (Lei) cu card – exclusiv Netopia.
 * PayU nu mai este folosit pentru credite (evită redirect greșit la secure.payu.com).
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { getNetopiaConfig } from '@/lib/netopia-config';
import { startNetopiaPayment } from '@/lib/netopia-payment';
import { buildMobilPayRequest } from '@/lib/netopia-mobilpay';
import { getPublicSiteBaseUrl } from '@/lib/get-public-site-url';
import { paymentJson } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    console.error('[Credits Payment] Supabase admin client not available');
    throw new Error('Supabase admin client not configured.');
  }
  return supabaseAdmin;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdminClient = getSupabaseAdmin();

    /** Cookie session (same-origin) sau Bearer JWT — la fel ca premium/initiate-payment. */
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return paymentJson(
        { error: 'Token de autentificare lipsă sau sesiune expirată' },
        { status: 401 }
      );
    }

    let body: { amount: number; credits: number; browserData?: Record<string, string | number | boolean> };
    try {
      body = await request.json();
    } catch {
      return paymentJson(
        { error: 'Corpul cererii nu este valid JSON' },
        { status: 400 }
      );
    }

    const { amount, credits, browserData } = body;
    const amountNum = Number(amount);
    const creditsNum = Math.floor(Number(credits)) || amountNum;

    if (amountNum <= 0) {
      return paymentJson(
        { error: 'Suma trebuie să fie pozitivă' },
        { status: 400 }
      );
    }

    const paymentIntentId = `CREDIT-${Date.now()}-${user.id.substring(0, 8)}`;
    const baseUrl = getPublicSiteBaseUrl();
    const returnUrl = `${baseUrl}/api/credits/payment-callback?intent=${encodeURIComponent(paymentIntentId)}`;
    const notifyUrlNetopia = `${baseUrl}/api/credits/payment-notify?intent=${encodeURIComponent(paymentIntentId)}`;

    const meta = user.user_metadata || {};

    const { error: intentError } = await supabaseAdminClient
      .from('user_payments')
      .insert({
        user_id: user.id,
        amount: 0,
        currency: 'RON',
        payment_type: 'credit_purchase',
        description: `Cumpărare credite (${creditsNum} credite)`,
        metadata: {
          payment_intent_id: paymentIntentId,
          amount: amountNum,
          credits: creditsNum,
          payment_method: 'netopia',
        },
      });
    if (intentError) {
      console.error('[Credits Payment] Error creating payment intent:', intentError);
      return paymentJson(
        { error: 'Eroare la crearea intenției de plată' },
        { status: 500 }
      );
    }

    const netopiaConfig = await getNetopiaConfig();

    // Flux certificate: Semnătură + Public Key + Private Key (fără API Key)
    if (netopiaConfig.useCertificateFlow && netopiaConfig.posSignature && netopiaConfig.publicKey) {
      const firstName = (meta.first_name as string) || (meta.firstName as string) || 'Client';
      const lastName = (meta.last_name as string) || (meta.lastName as string) || 'gobid';
      const mobilResult = buildMobilPayRequest(
        netopiaConfig.posSignature!,
        netopiaConfig.publicKey!,
        {
          orderId: paymentIntentId,
          amount: amountNum,
          currency: 'RON',
          details: `Cumpărare ${creditsNum} credite gobid.ro`,
          confirmUrl: notifyUrlNetopia,
          returnUrl,
          billing: {
            email: user.email || 'client@gobid.ro',
            firstName,
            lastName,
          },
        },
        netopiaConfig.testMode,
        netopiaConfig.paymentUrl
      );

      if (!mobilResult.success) {
        return paymentJson(
          { error: mobilResult.message || 'Eroare la construirea cererii mobilPay' },
          { status: 400 }
        );
      }

      return paymentJson({
        success: true,
        payment_intent_id: paymentIntentId,
        use_form_redirect: true,
        form_url: mobilResult.formUrl,
        env_key: mobilResult.env_key,
        data: mobilResult.data,
        iv: mobilResult.iv ?? '',
        cipher: mobilResult.cipher ?? 'aes-256-cbc',
        message: 'Redirecționare către Netopia pentru plată...',
      });
    }

    if (!netopiaConfig.apiKey || !netopiaConfig.posSignature) {
      return paymentJson(
        {
          error: 'Netopia nu este configurat',
          message: 'Admin → Module → Netopia: Semnătură, Public Key și Private Key (Setări tehnice).',
        },
        { status: 400 }
      );
    }

    const firstName = (meta.first_name as string) || (meta.firstName as string) || '';
    const lastName = (meta.last_name as string) || (meta.lastName as string) || '';

    const result = await startNetopiaPayment(netopiaConfig, {
      orderId: paymentIntentId,
      amount: amountNum,
      currency: 'RON',
      description: `Cumpărare ${creditsNum} credite gobid.ro`,
      redirectUrl: returnUrl,
      notifyUrl: notifyUrlNetopia,
      billing: {
        email: user.email || 'client@gobid.ro',
        firstName: firstName || 'Client',
        lastName: lastName || 'gobid',
        country: 642,
        countryName: 'Romania',
      },
      browserData,
    });

    if (!result.success || !result.paymentURL) {
      return paymentJson(
        {
          error: result.message || 'Eroare la inițierea plății Netopia',
          details: result.errorCode,
        },
        { status: 400 }
      );
    }

    return paymentJson({
      success: true,
      payment_intent_id: paymentIntentId,
      payment_url: result.paymentURL,
      message: 'Redirecționare către Netopia pentru plată...',
    });
  } catch (error: unknown) {
    console.error('[Credits Payment] Error:', error);
    return paymentJson(
      {
        error: 'Eroare la inițierea plății',
        message: error instanceof Error ? error.message : 'Eroare necunoscută',
      },
      { status: 500 }
    );
  }
}
