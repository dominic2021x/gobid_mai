/**
 * API Route pentru inițierea plății premium (Netopia preferat, PayU opțional sau Credit)
 * payment_method: 'credit' | 'payu' | 'netopia' (implicit: netopia pentru card).
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
    console.error('[Premium Payment] Supabase admin client not available');
    throw new Error('Supabase admin client not configured. Please check environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return supabaseAdmin;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (!supabaseAdmin) {
      console.error('[Premium Payment] supabaseAdmin is null');
      return paymentJson(
        { error: 'Server configuration error: Supabase admin client not available' },
        { status: 500 }
      );
    }

    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return paymentJson(
        { error: 'Token de autentificare lipsă sau sesiune expirată' },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Premium Payment] Error parsing request body:', error);
      return paymentJson(
        { error: 'Corpul cererii nu este valid JSON' },
        { status: 400 }
      );
    }

    const { product_id, amount, weeks, payment_method, browserData } = body as {
      product_id?: string;
      amount?: unknown;
      weeks?: unknown;
      payment_method?: string;
      browserData?: Record<string, string | number | boolean>;
    };

    console.log('[Premium Payment] Request body:', { product_id, amount, weeks, payment_method, amountType: typeof amount });

    // Validate required parameters
    if (!product_id) {
      console.error('[Premium Payment] Missing product_id');
      return paymentJson(
        { error: 'Lipsă product_id' },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      console.error('[Premium Payment] Invalid amount:', amount);
      return paymentJson(
        { error: 'Lipsă sau invalid amount' },
        { status: 400 }
      );
    }

    if (!weeks || isNaN(Number(weeks))) {
      console.error('[Premium Payment] Invalid weeks:', weeks);
      return paymentJson(
        { error: 'Lipsă sau invalid weeks' },
        { status: 400 }
      );
    }

    // Ensure amount is a number
    const amountNum = Number(amount);
    if (amountNum <= 0) {
      console.error('[Premium Payment] Amount must be positive:', amountNum);
      return paymentJson(
        { error: 'Amount trebuie să fie pozitiv' },
        { status: 400 }
      );
    }

    // Validate payment_method: credit | netopia (implicit) | payu (doar la cerere)
    const validPaymentMethod =
      payment_method === 'credit'
        ? 'credit'
        : payment_method === 'payu'
          ? 'payu'
          : 'netopia';
    console.log('[Premium Payment] Payment method:', validPaymentMethod);

    // Validate weeks
    const weeksNum = Number(weeks);
    if (isNaN(weeksNum) || weeksNum < 1 || weeksNum > 52) {
      return paymentJson(
        { error: 'Numărul de săptămâni trebuie să fie între 1 și 52' },
        { status: 400 }
      );
    }

    // Verifică că produsul aparține utilizatorului și obține statusul premium actual
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, user_id, title, is_premium, premium_until')
      .eq('id', product_id)
      .eq('user_id', user.id)
      .single();

    if (productError || !product) {
      return paymentJson(
        { error: 'Produsul nu a fost găsit sau nu îți aparține' },
        { status: 404 }
      );
    }

    // Verifică dacă produsul are deja premium activ pentru perioada respectivă
    const now = new Date();
    const currentPremiumUntil = product.premium_until ? new Date(product.premium_until) : null;
    const hasActivePremium = product.is_premium && currentPremiumUntil && currentPremiumUntil > now;

    if (hasActivePremium) {
      // Calculează perioada nouă care ar fi activată
      const newPremiumUntil = new Date(currentPremiumUntil.getTime() + weeksNum * 7 * 24 * 60 * 60 * 1000);
      
      // Verifică dacă perioada nouă se suprapune cu cea existentă
      // Dacă premium_until existent este în viitor față de perioada nouă, înseamnă că se suprapune
      if (currentPremiumUntil >= now) {
        // Premium-ul este deja activ - verifică dacă perioada nouă se suprapune complet
        const newPeriodStart = now;
        const newPeriodEnd = new Date(now.getTime() + weeksNum * 7 * 24 * 60 * 60 * 1000);
        
        // Dacă perioada nouă se suprapune complet cu cea existentă, nu permite cumpărarea
        if (newPeriodEnd <= currentPremiumUntil) {
          const daysLeft = Math.ceil((currentPremiumUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return paymentJson(
            { 
              error: `Acest produs are deja premium activ până pe ${currentPremiumUntil.toLocaleDateString('ro-RO')} (${daysLeft} zile rămase). Nu poți cumpăra premium pentru aceeași perioadă.`,
              details: `Premium activ până: ${currentPremiumUntil.toISOString()}, Perioadă nouă: ${newPeriodEnd.toISOString()}`
            },
            { status: 400 }
          );
        }
        
        // Dacă perioada nouă extinde cea existentă, permite extinderea
        console.log('[Premium Payment] Extending premium period:', {
          currentUntil: currentPremiumUntil.toISOString(),
          weeksToAdd: weeksNum,
          newUntil: newPremiumUntil.toISOString()
        });
      }
    } else {
      // Prima activare premium - calculează de la acum
      console.log('[Premium Payment] First premium activation for product');
    }

    // Dacă plata este cu credit, verifică balanța din user_payments (suma plăților)
    if (validPaymentMethod === 'credit') {
      console.log('[Premium Payment] Processing credit payment for user:', user.id);
      
      // Load all payments for this user to calculate total credit
      const { data: payments, error: paymentsError } = await supabaseAdmin
        .from('user_payments')
        .select('amount')
        .eq('user_id', user.id);

      if (paymentsError) {
        console.error('[Premium Payment] Error loading payments for credit check:', paymentsError);
        return paymentJson(
          { error: 'Nu s-au putut verifica creditele', details: paymentsError.message },
          { status: 500 }
        );
      }

      console.log('[Premium Payment] Loaded payments:', payments);

      // Calculate total credit (sum of all payment amounts) - same logic as admin
      const totalCredit = payments?.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) || 0;
      
      console.log('[Premium Payment] Total credit calculated:', totalCredit, 'Amount needed:', amountNum);

      // Creditul este în Lei, deci comparăm direct
      if (totalCredit < amountNum) {
        console.log('[Premium Payment] Insufficient credit:', { totalCredit, amountNum });
        return paymentJson(
          { error: `Credit insuficient. Ai ${totalCredit.toFixed(2)} Lei, dar ai nevoie de ${amountNum.toFixed(2)} Lei` },
          { status: 400 }
        );
      }

      // Procesează plata cu credit direct
      // Dacă produsul are deja premium activ, extinde perioada; altfel, începe de la acum
      const now = new Date();
      let premiumUntil: Date;
      
      if (hasActivePremium && currentPremiumUntil) {
        // Extinde perioada existentă
        premiumUntil = new Date(currentPremiumUntil.getTime() + weeksNum * 7 * 24 * 60 * 60 * 1000);
        console.log('[Premium Payment] Extending premium period:', {
          from: currentPremiumUntil.toISOString(),
          to: premiumUntil.toISOString(),
          weeksAdded: weeksNum
        });
      } else {
        // Prima activare - începe de la acum
        premiumUntil = new Date(now.getTime() + weeksNum * 7 * 24 * 60 * 60 * 1000);
        console.log('[Premium Payment] First premium activation:', {
          from: now.toISOString(),
          to: premiumUntil.toISOString(),
          weeks: weeksNum
        });
      }

      console.log('[Premium Payment] Updating product:', {
        product_id,
        premium_until: premiumUntil.toISOString(),
        is_premium: true,
        weeks: weeksNum
      });

      // Actualizează produsul
      const { data: updatedProduct, error: updateError } = await supabaseAdmin
        .from('products')
        .update({
          premium_until: premiumUntil.toISOString(),
          is_premium: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product_id)
        .select('id, title, premium_until, is_premium')
        .maybeSingle();

      if (updateError) {
        console.error('[Premium Payment] Error updating product with premium:', updateError);
        console.error('[Premium Payment] Update error details:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          error: updateError
        });
        
        // Verifică dacă eroarea este legată de coloanele lipsă
        const errorMessage = updateError.message || 'Eroare necunoscută';
        const isColumnMissing = errorMessage.includes('column') && (
          errorMessage.includes('premium_until') || 
          errorMessage.includes('is_premium')
        );
        
        if (isColumnMissing) {
          return paymentJson(
            { 
              error: 'Coloanele premium nu există în baza de date. Te rugăm să rulezi migrația 20251221_premium_promotion.sql',
              details: errorMessage
            },
            { status: 500 }
          );
        }
        
        return paymentJson(
          { 
            error: 'Eroare la actualizarea produsului',
            details: errorMessage,
            code: updateError.code,
            hint: updateError.hint
          },
          { status: 500 }
        );
      }

      if (!updatedProduct) {
        console.error('[Premium Payment] Product not found after update');
        return paymentJson(
          { error: 'Produsul nu a fost găsit după actualizare' },
          { status: 404 }
        );
      }

      console.log('[Premium Payment] Product updated successfully:', updatedProduct);

      // Scade creditul - adăugăm o plată negativă în user_payments pentru a reduce creditul
      // (sau putem crea o înregistrare de debit în user_payments)
      console.log('[Premium Payment] Deducting credit:', amountNum);
      const { error: creditError } = await supabaseAdmin
        .from('user_payments')
        .insert({
          user_id: user.id,
          amount: -amountNum, // Negative amount to deduct credit
          currency: 'RON',
          payment_type: 'premium_promotion_debit',
          description: `Deducere credit pentru promovare premium "${product.title}" - ${weeksNum} ${weeksNum === 1 ? 'săptămână' : 'săptămâni'}`,
          metadata: {
            product_id: product_id,
            weeks: weeksNum,
            debit_for_payment: true,
          },
        });

      if (creditError) {
        console.error('[Premium Payment] Error deducting credit:', creditError);
        // Rollback product update
        await supabaseAdmin
          .from('products')
          .update({
            premium_until: null,
            is_premium: false,
          })
          .eq('id', product_id);
        
        return paymentJson(
          { error: 'Eroare la deducerea creditului', details: creditError.message },
          { status: 500 }
        );
      }
      
      console.log('[Premium Payment] Credit deducted successfully');

      // Nu mai adăugăm o înregistrare de plată separată, deoarece am deja înregistrarea de debit
      // care reduce creditul. Dacă vrem să avem o înregistrare pozitivă pentru istoric,
      // o putem adăuga, dar pentru moment, înregistrarea de debit este suficientă.

      console.log('[Premium Payment] Credit payment successful');
      return paymentJson({
        success: true,
        message: `Promovare premium activată cu succes pentru ${weeksNum} ${weeksNum === 1 ? 'săptămână' : 'săptămâni'}!`,
        payment_method: 'credit',
      });
    }

    const paymentIntentId = `PREMIUM-${Date.now()}-${user.id.substring(0, 8)}`;
    const baseUrl = getPublicSiteBaseUrl();
    const returnUrl = `${baseUrl}/api/premium/payment-callback?intent=${encodeURIComponent(paymentIntentId)}`;
    const notifyUrlNetopia = `${baseUrl}/api/premium/payment-notify?intent=${encodeURIComponent(paymentIntentId)}`;
    const notifyUrlPayU = `${baseUrl}/api/payments/payu/notify`;
    const meta = user.user_metadata || {};
    const customerIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    let intentCreated = false;

    if (validPaymentMethod === 'payu') {
      const payuConfig = await getPayUConfig();
      if (!payuConfig) {
        return paymentJson(
          { error: 'PayU nu este configurat', message: 'Verifică .env.local sau Admin → Module → PayU. Sau alege Netopia.' },
          { status: 400 }
        );
      }
      const { error: intentError } = await supabaseAdmin
        .from('user_payments')
        .insert({
          user_id: user.id,
          amount: amount,
          currency: 'RON',
          payment_type: 'premium_promotion',
          description: `Promovare premium pentru "${product.title}" - ${weeksNum} ${weeksNum === 1 ? 'săptămână' : 'săptămâni'}`,
          metadata: {
            product_id: product_id,
            weeks: weeksNum,
            payment_intent_id: paymentIntentId,
            payment_method: 'payu',
          },
        });
      if (intentError) {
        console.error('[Premium Payment] Error creating payment intent:', intentError);
        return paymentJson({ error: 'Eroare la crearea intenției de plată' }, { status: 500 });
      }
      intentCreated = true;
      const payuResult = await createPayUOrder(payuConfig, {
        extOrderId: paymentIntentId,
        totalAmount: ronToPayUAmount(amountNum),
        currencyCode: 'RON',
        description: `Premium "${product.title}" - ${weeksNum} săpt.`,
        notifyUrl: notifyUrlPayU,
        continueUrl: returnUrl,
        customerIp,
        products: [{ name: `Premium ${product.title}`, unitPrice: ronToPayUAmount(amountNum), quantity: 1 }],
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
      console.error('[Premium Payment] PayU failed:', payuResult.message, payuResult.raw);
      return paymentJson(
        { error: 'PayU a refuzat cererea', message: payuResult.message || 'Încearcă Netopia.' },
        { status: 400 }
      );
    }

    if (!intentCreated) {
      const { error: intentError } = await supabaseAdmin
        .from('user_payments')
        .insert({
          user_id: user.id,
          amount: amount,
          currency: 'RON',
          payment_type: 'premium_promotion',
          description: `Promovare premium pentru "${product.title}" - ${weeksNum} ${weeksNum === 1 ? 'săptămână' : 'săptămâni'}`,
          metadata: {
            product_id: product_id,
            weeks: weeksNum,
            payment_intent_id: paymentIntentId,
            payment_method: 'netopia',
          },
        });
      if (intentError) {
        console.error('[Premium Payment] Error creating payment intent:', intentError);
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
          details: `Premium "${product.title}" - ${weeksNum} săpt.`,
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
      description: `Premium "${product.title}" - ${weeksNum} săpt.`,
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
  } catch (error: any) {
    console.error('[Premium Payment] Error in premium payment initiation:', error);
    console.error('[Premium Payment] Error stack:', error.stack);
    return paymentJson(
      {
        error: 'Eroare la inițierea plății',
        message: error.message || 'Eroare necunoscută',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}





















