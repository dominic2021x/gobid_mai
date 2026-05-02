/**
 * POST /api/netopia/test
 * Verifică credentialele Netopia PE SERVERUL Netopia (mobilPay).
 * Flux: 1) construiește cerere test, 2) POST la sandbox/live, 3) verifică răspunsul.
 */

import { NextRequest } from 'next/server';
import { buildMobilPayRequest } from '@/lib/netopia-mobilpay';
import { getPublicSiteBaseUrl } from '@/lib/get-public-site-url';
import { paymentJson } from '@/lib/payment-http';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const SANDBOX_URL = 'https://sandboxsecure.mobilpay.ro';
const LIVE_URL = 'https://secure.mobilpay.ro';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = (body || {}) as {
      publicKey?: string;
      privateKey?: string;
      merchantSignature?: string;
      testMode?: boolean;
      /** Override URL din Admin → Module (sandbox / live) */
      paymentUrl?: string;
    };

    const publicKey = (config.publicKey ?? '').trim();
    const privateKey = (config.privateKey ?? '').trim();
    const merchantSignature = (config.merchantSignature ?? '').trim();
    /** true / omis (undefined) = Sandbox; false = Live (ca în formularul admin). */
    const isTest = config.testMode !== false;

    if (!merchantSignature) {
      return paymentJson({
        success: false,
        message: 'Completează Semnătura (Setări tehnice → Puncte de Vânzare).',
      });
    }

    if (!publicKey || !publicKey.includes('BEGIN')) {
      return paymentJson({
        success: false,
        message: 'Public Key invalid. Format așteptat: -----BEGIN CERTIFICATE----- sau -----BEGIN PUBLIC KEY-----.',
      });
    }

    if (!privateKey || !privateKey.includes('BEGIN')) {
      return paymentJson({
        success: false,
        message: 'Private Key invalid. Format așteptat: -----BEGIN RSA PRIVATE KEY----- sau -----BEGIN PRIVATE KEY-----.',
      });
    }

    // 1. Construiește cerere minimă de test (0.01 Lei)
    const baseUrl = getPublicSiteBaseUrl();
    const testOrderId = `TEST-${Date.now()}`;
    const mobilResult = buildMobilPayRequest(
      merchantSignature,
      publicKey,
      {
        orderId: testOrderId,
        amount: 0.01,
        currency: 'RON',
        details: 'Verificare credentiale Netopia – nu achita',
        confirmUrl: `${baseUrl}/api/credits/payment-notify`,
        returnUrl: `${baseUrl}/api/credits/payment-callback`,
        billing: {
          email: 'test@gobid.ro',
          firstName: 'Test',
          lastName: 'Validare',
        },
      },
      isTest
    );

    if (!mobilResult.success) {
      return paymentJson({
        success: false,
        message: `Eroare la construirea cererii: ${mobilResult.message}. Verifică Semnătura și Public Key.`,
      });
    }

    // 2. POST pe serverul Netopia (verificare efectivă)
    // mobilPay cere toate 4 câmpuri: iv, env_key, data, cipher (issue mobilpay/Node.js#8)
    const urlOverride = (config.paymentUrl ?? '').trim();
    const url =
      urlOverride ||
      (isTest ? SANDBOX_URL : LIVE_URL);
    const formData = new URLSearchParams();
    formData.set('env_key', mobilResult.env_key);
    formData.set('data', mobilResult.data);
    formData.set('iv', mobilResult.iv ?? '');
    formData.set('cipher', mobilResult.cipher ?? 'aes-256-cbc');

    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      redirect: 'manual',
    });

    const responseText = await res.text();
    const bodyLower = responseText.toLowerCase();

    // 3. Verificare răspuns
    // 302 = redirect către formular plată → server a acceptat cererea
    if (res.status === 302) {
      return paymentJson({
        success: true,
        message: `Verificare pe server reușită! Credentialele sunt valide. ${isTest ? 'Mod Sandbox (Test).' : 'Mod Live.'}`,
      });
    }

    // 200: paginile Netopia/mobilPay conțin adesea în JS cuvinte precum "error" / "invalid" → vechile euristici dădeau fals negativ.
    if (res.status === 200) {
      const hasMobilpayFormPayload =
        /name\s*=\s*["']env_key["']/i.test(responseText) &&
        /name\s*=\s*["']data["']/i.test(responseText);
      if (hasMobilpayFormPayload) {
        return paymentJson({
          success: true,
          message: `Verificare pe server reușită! Credentialele sunt valide. ${isTest ? 'Mod Sandbox (Test).' : 'Mod Live.'}`,
        });
      }

      // Mesaje de eroare tipice de la gateway (mai stricte decât orice "error" în HTML)
      const strictGatewayError =
        /signature\s+is\s+missing|invalid\s+signature|signature\s+invalid|semnatur(a|ă)\s+incorect|cheie\s+incorect|cheia\s+public/i.test(
          responseText
        ) ||
        /cererea\s+(nu\s+)?(este\s+)?invalid|tranzac(t|ț)ie\s+respins|plata\s+a\s+fost\s+respins|payment\s+refused/i.test(
          bodyLower
        ) ||
        /cod(ul)?\s+(de\s+)?eroare/i.test(bodyLower) &&
          (bodyLower.includes('mobilpay') ||
            bodyLower.includes('netopia') ||
            bodyLower.includes('secure.mobilpay'));

      if (strictGatewayError) {
        return paymentJson({
          success: false,
          message: `Netopia a respins cererea. Verifică Semnătura, Public Key și Private Key pentru mediul ${isTest ? 'Test' : 'Live'}. Posibil: chei din alt mediu sau semnătură greșită.`,
        });
      }

      const looksLikePaymentPage =
        (bodyLower.includes('mobilpay') || bodyLower.includes('netopia')) &&
        (bodyLower.includes('card') ||
          bodyLower.includes('plată') ||
          bodyLower.includes('plata') ||
          bodyLower.includes('payment') ||
          bodyLower.includes('method="post"') ||
          bodyLower.includes("method='post'"));

      if (looksLikePaymentPage) {
        return paymentJson({
          success: true,
          message: `Verificare pe server reușită! Credentialele sunt valide. ${isTest ? 'Mod Sandbox (Test).' : 'Mod Live.'}`,
        });
      }
    }

    // Răspuns neașteptat
    return paymentJson({
      success: false,
      message: `Răspuns neașteptat de la Netopia (${res.status}). Verifică că folosești credentialele corecte pentru mediul ${isTest ? 'Test (sandboxsecure.mobilpay.ro)' : 'Live (secure.mobilpay.ro)'}.`,
    });
  } catch (err) {
    console.warn('[netopia/test]', err);
    return paymentJson(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Eroare la verificarea pe serverul Netopia.',
      },
      { status: 500 }
    );
  }
}
