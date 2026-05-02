/**
 * API Route pentru inițierea plății pachet tokeni cu card
 * Preferință: Netopia (implicit), PayU doar la cerere.
 * Suportă payment_method: 'payu' | 'netopia' (implicit: netopia).
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { getNetopiaConfig } from '@/lib/netopia-config';
import { getPayUConfig } from '@/lib/payu-config';
import { createPayUOrder, ronToPayUAmount } from '@/lib/payu-payment';
import { buildMobilPayRequest } from '@/lib/netopia-mobilpay';
import { startNetopiaPayment } from '@/lib/netopia-payment';
import { getPublicSiteBaseUrl } from '@/lib/get-public-site-url';
import { paymentJson } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    console.error('[Tokens Payment] Supabase admin client not available');
    throw new Error('Supabase admin client not configured.');
  }
  return supabaseAdmin;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdminClient = getSupabaseAdmin();

    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return paymentJson(
        { error: 'Token de autentificare lipsă sau sesiune expirată' },
        { status: 401 }
      );
    }

    let body: {
      package_id: string;
      package_name: string;
      amount: number;
      tokens: number;
      payment_method?: string;
      browserData?: Record<string, string | number | boolean>;
    };
    try {
      body = await request.json();
    } catch {
      return paymentJson(
        { error: 'Corpul cererii nu este valid JSON' },
        { status: 400 }
      );
    }

    const { package_id, package_name, amount, tokens, payment_method: preferredGateway, browserData } = body;
    // Implicit folosim Netopia; PayU doar când payment_method === 'payu'
    const usePayU = preferredGateway === 'payu';

    if (!package_id || !package_name || amount == null || amount < 0 || tokens == null || tokens < 0) {
      return paymentJson(
        { error: 'Parametri invalizi: package_id, package_name, amount, tokens sunt obligatorii' },
        { status: 400 }
      );
    }

    const amountNum = Number(amount);
    const tokensNum = Math.floor(Number(tokens));
    if (amountNum <= 0 && tokensNum <= 0) {
      return paymentJson(
        { error: 'Amount sau tokens trebuie să fie pozitivi' },
        { status: 400 }
      );
    }

    const paymentIntentId = `TKN-${Date.now()}-${user.id.substring(0, 8)}`;
    const baseUrl = getPublicSiteBaseUrl();
    const returnUrl = `${baseUrl}/api/tokens/payment-callback?intent=${encodeURIComponent(paymentIntentId)}`;
    const notifyUrlNetopia = `${baseUrl}/api/tokens/payment-notify?intent=${encodeURIComponent(paymentIntentId)}`;
    const notifyUrlPayU = `${baseUrl}/api/payments/payu/notify`;
    const meta = user.user_metadata || {};
    const customerIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    let intentCreated = false;

    if (usePayU) {
      const payuConfig = await getPayUConfig();
      if (!payuConfig) {
        return paymentJson(
          { error: 'PayU nu este configurat', message: 'Verifică .env.local sau Admin → Module → PayU. Sau alege „Card (Netopia)”.' },
          { status: 400 }
        );
      }
      const { error: intentError } = await supabaseAdminClient
        .from('user_payments')
        .insert({
          user_id: user.id,
          amount: 0,
          currency: 'RON',
          payment_type: 'tokens_purchase',
          description: `Cumpărare tokeni - ${package_name}`,
          metadata: {
            payment_intent_id: paymentIntentId,
            package_id,
            package_name,
            tokens: tokensNum,
            amount: amountNum,
            payment_method: 'payu',
          },
        });
      if (intentError) {
        console.error('[Tokens Payment] Error creating payment intent:', intentError);
        return paymentJson({ error: 'Eroare la crearea intenției de plată' }, { status: 500 });
      }
      intentCreated = true;
      const payuResult = await createPayUOrder(payuConfig, {
        extOrderId: paymentIntentId,
        totalAmount: ronToPayUAmount(amountNum),
        currencyCode: 'RON',
        description: `Tokeni gobid - ${package_name}`,
        notifyUrl: notifyUrlPayU,
        continueUrl: returnUrl,
        customerIp,
        products: [{ name: `Pachet ${package_name} (${tokensNum} tokeni)`, unitPrice: ronToPayUAmount(amountNum), quantity: 1 }],
        buyer: {
          email: (user.email as string) || undefined,
          firstName: (meta.first_name as string) || (meta.firstName as string) || undefined,
          lastName: (meta.last_name as string) || (meta.lastName as string) || undefined,
          language: 'ro',
        },
      });
      if (payuResult.success && payuResult.redirectUri) {
        return paymentJson({
          success: true,
          payment_intent_id: paymentIntentId,
          payment_url: payuResult.redirectUri,
          message: 'Redirecționare către PayU pentru plată...',
        });
      }
      console.error('[Tokens Payment] PayU failed:', payuResult.message, payuResult.raw);
      return paymentJson(
        { error: 'PayU a refuzat cererea', message: payuResult.message || 'Încearcă „Card (Netopia)”.' },
        { status: 400 }
      );
    }

    if (!intentCreated) {
      const { error: intentError } = await supabaseAdminClient
        .from('user_payments')
        .insert({
          user_id: user.id,
          amount: 0,
          currency: 'RON',
          payment_type: 'tokens_purchase',
          description: `Cumpărare tokeni - ${package_name}`,
          metadata: {
            payment_intent_id: paymentIntentId,
            package_id,
            package_name,
            tokens: tokensNum,
            amount: amountNum,
            payment_method: 'netopia',
          },
        });
      if (intentError) {
        console.error('[Tokens Payment] Error creating payment intent:', intentError);
        return paymentJson(
          { error: 'Eroare la crearea intenției de plată' },
          { status: 500 }
        );
      }
    }

    const netopiaConfig = await getNetopiaConfig();

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
          details: `Tokeni gobid - ${package_name}`,
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
          message: 'Admin → Module → Netopia: Semnătură, Public Key și Private Key sau API Key.',
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
      description: `Tokeni gobid - ${package_name}`,
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
    console.error('[Tokens Payment] Error:', error);
    return paymentJson(
      {
        error: 'Eroare la inițierea plății',
        message: error instanceof Error ? error.message : 'Eroare necunoscută',
      },
      { status: 500 }
    );
  }
}
