import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * POST - Redeem newsletter token code
 * Validează și folosește codul de tokeni de la newsletter
 * 
 * Cerințe:
 * - Utilizatorul trebuie să fie autentificat
 * - Emailul utilizatorului trebuie să fie același cu emailul din newsletter_subscribers
 * - Codul trebuie să existe și să nu fie deja folosit
 * - Codul poate fi folosit doar o dată
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenCode } = body;

    if (!tokenCode || typeof tokenCode !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Codul de tokeni este obligatoriu' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get user from authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Trebuie să fii autentificat pentru a folosi codul' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { success: false, message: 'Sesiune invalidă. Te rog autentifică-te din nou.' },
        { status: 401 }
      );
    }

    const userId = authUser.user.id;
    const userEmail = authUser.user.email?.toLowerCase().trim();

    if (!userEmail) {
      return NextResponse.json(
        { success: false, message: 'Email-ul contului nu este disponibil' },
        { status: 400 }
      );
    }

    // Find subscriber with this token code
    const { data: subscriber, error: subscriberError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('*')
      .eq('token_code', tokenCode.trim().toUpperCase())
      .maybeSingle();

    if (subscriberError) {
      console.error('[Newsletter Redeem] Error fetching subscriber:', subscriberError);
      return NextResponse.json(
        { success: false, message: 'Eroare la verificarea codului' },
        { status: 500 }
      );
    }

    if (!subscriber) {
      return NextResponse.json(
        { success: false, message: 'Cod invalid. Verifică că ai introdus codul corect.' },
        { status: 404 }
      );
    }

    // Verify email matches
    const subscriberEmail = subscriber.email?.toLowerCase().trim();
    if (subscriberEmail !== userEmail) {
      return NextResponse.json(
        { success: false, message: 'Codul poate fi folosit doar cu contul asociat email-ului de la newsletter. Email-ul contului tău nu se potrivește cu email-ul de la newsletter.' },
        { status: 403 }
      );
    }

    // Check if code already used
    if (subscriber.token_code_used) {
      return NextResponse.json(
        { success: false, message: 'Acest cod a fost deja folosit. Fiecare cod poate fi folosit doar o dată.' },
        { status: 400 }
      );
    }

    // Get current user tokens
    const { data: tokensRow, error: tokensError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokensError && tokensError.code !== 'PGRST116') {
      console.error('[Newsletter Redeem] Error fetching tokens:', tokensError);
      return NextResponse.json(
        { success: false, message: 'Eroare la încărcarea tokenilor' },
        { status: 500 }
      );
    }

    const currentBalance = tokensRow?.balance ?? 0;
    const currentTotalEarned = tokensRow?.total_earned ?? 0;
    const tokensToAdd = subscriber.tokens ?? 5;

    // Update user tokens
    const newBalance = currentBalance + tokensToAdd;
    const newTotalEarned = currentTotalEarned + tokensToAdd;

    const { error: updateTokensError } = await supabaseAdmin
      .from('user_tokens')
      .upsert({
        user_id: userId,
        user_email: userEmail,
        balance: newBalance,
        total_earned: newTotalEarned,
        total_spent: tokensRow?.total_spent ?? 0,
        level: tokensRow?.level ?? 'Basic',
        package_type: tokensRow?.package_type ?? 'Basic',
      }, { onConflict: 'user_id' });

    if (updateTokensError) {
      console.error('[Newsletter Redeem] Error updating tokens:', updateTokensError);
      return NextResponse.json(
        { success: false, message: 'Eroare la adăugarea tokenilor' },
        { status: 500 }
      );
    }

    // Mark code as used
    const { error: updateSubscriberError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({
        token_code_used: true,
      })
      .eq('id', subscriber.id);

    if (updateSubscriberError) {
      console.error('[Newsletter Redeem] Error marking code as used:', updateSubscriberError);
      // Don't fail the request, tokens were already added
    }

    return NextResponse.json({
      success: true,
      message: `Ai primit ${tokensToAdd} tokeni cu succes!`,
      tokensAdded: tokensToAdd,
      newBalance: newBalance,
    });
  } catch (error: any) {
    console.error('[Newsletter Redeem] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Eroare la folosirea codului' },
      { status: 500 }
    );
  }
}