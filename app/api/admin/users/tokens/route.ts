import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase/server';
import { sendUserPushNotification } from '@/lib/push/sendUserPushNotification';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ADMIN_ROLES = ['admin', 'superadmin', 'administrator'];

async function isAdminUser(user: any, supabaseAdmin: any): Promise<boolean> {
  // Check metadata first (fast check)
  const roles = new Set<string>();
  const metaRole =
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);
  if (metaRole) roles.add(String(metaRole).toLowerCase());

  if (Array.isArray(user?.app_metadata?.roles)) {
    user.app_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }
  if (Array.isArray(user?.user_metadata?.roles)) {
    user.user_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
  }

  if (user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true) {
    return true;
  }

  if (Array.from(roles).some((role) => ADMIN_ROLES.includes(role))) {
    return true;
  }

  // Check user_profiles table as fallback
  if (user?.id && supabaseAdmin) {
    try {
      const { data: profile, error } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && profile?.is_admin === true) {
        return true;
      }
    } catch (e) {
      console.error('Error checking admin status in user_profiles:', e);
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get('authorization');
    let authenticatedUser: any | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const accessToken = authHeader.replace('Bearer ', '').trim();
      if (accessToken) {
        const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (!authError && authUser?.user) {
          authenticatedUser = authUser.user;
        }
      }
    }

    // Same as GET /api/admin/users: cookie session when Bearer is absent.
    if (!authenticatedUser) {
      const supabaseServer = await createServerClient();
      const { data: cookieAuthData, error: cookieAuthError } = await supabaseServer.auth.getUser();
      if (!cookieAuthError && cookieAuthData?.user) {
        authenticatedUser = cookieAuthData.user;
      }
    }

    if (!authenticatedUser) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const isAdmin = await isAdminUser(authenticatedUser, supabaseAdmin);
    console.log('[Admin Tokens API] Admin check:', {
      userId: authenticatedUser.id,
      email: authenticatedUser.email,
      isAdmin,
      user_metadata: authenticatedUser.user_metadata,
      app_metadata: authenticatedUser.app_metadata
    });

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      tokensAmount = 0,
      tokensOperation = 'add',
      creditAmount = 0,
      creditOperation = 'add',
      note,
    } = body ?? {};

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (tokensAmount < 0 || creditAmount < 0) {
      return NextResponse.json({ error: 'Amounts must be positive values' }, { status: 400 });
    }

    const { data: tokensRow, error: tokensError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokensError) {
      console.error('Failed to fetch user tokens:', tokensError);
      return NextResponse.json({ error: 'Cannot read current token balance' }, { status: 500 });
    }

    const startingTokens = tokensRow ?? {
      balance: 0,
      total_earned: 0,
      total_spent: 0,
      level: 'Basic',
    };

    let balance = startingTokens.balance ?? 0;
    let totalEarned = startingTokens.total_earned ?? 0;
    let totalSpent = startingTokens.total_spent ?? 0;

    if (tokensAmount > 0) {
      if (tokensOperation === 'add') {
        balance += tokensAmount;
        totalEarned += tokensAmount;
      } else {
        balance = Math.max(0, balance - tokensAmount);
        totalSpent += tokensAmount;
      }
    }

    // Get user email for user_tokens table
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = targetUser?.user?.email || '';

    const { error: upsertTokensError } = await supabaseAdmin.from('user_tokens').upsert(
      {
        user_id: userId,
        user_email: userEmail,
        balance,
        total_earned: totalEarned,
        total_spent: totalSpent,
        level: startingTokens.level ?? 'Basic',
        package_type: startingTokens.level ?? 'Basic',
      },
      { onConflict: 'user_id' }
    );

    if (upsertTokensError) {
      console.error('Failed to update user tokens:', upsertTokensError);
      return NextResponse.json({ error: 'Cannot update token balance' }, { status: 500 });
    }

    let paymentRecord = null;

    if (creditAmount > 0) {
      const signedAmount = creditOperation === 'add' ? creditAmount : -creditAmount;
      const invoiceNumber = `${creditOperation === 'add' ? 'ADMIN-ADD' : 'ADMIN-SUB'}-${Date.now()}`;
      const paymentType =
        creditOperation === 'add' ? 'admin_credit' : 'admin_credit_adjustment';

      const { data: payment, error: insertPaymentError } = await supabaseAdmin
        .from('user_payments')
        .insert({
          user_id: userId,
          amount: signedAmount,
          currency: 'RON',
          payment_type: paymentType,
          description:
            note ||
            (creditOperation === 'add'
              ? 'Credit adăugat din panoul de administrare'
              : 'Credit redus din panoul de administrare'),
          invoice_number: invoiceNumber,
          metadata: {
            admin_user_id: authenticatedUser.id,
            admin_email: authenticatedUser.email,
            note: note ?? null,
          },
        })
        .select('*')
        .single();

      if (insertPaymentError) {
        console.error('Failed to insert user payment:', insertPaymentError);
        return NextResponse.json(
          { error: 'Cannot record payment history, operation aborted' },
          { status: 500 }
        );
      }

      paymentRecord = payment;
    }

    // Notificare bonus: doar când admin adaugă tokeni/credit.
    if ((tokensAmount > 0 && tokensOperation === 'add') || (creditAmount > 0 && creditOperation === 'add')) {
      try {
        const bonusParts: string[] = [];
        if (tokensAmount > 0 && tokensOperation === 'add') {
          bonusParts.push(`${tokensAmount} tokeni`);
        }
        if (creditAmount > 0 && creditOperation === 'add') {
          bonusParts.push(`${creditAmount} credite`);
        }

        const bonusText = bonusParts.join(' și ');
        const bonusMessage = `Ai primit bonus ${bonusText} din partea gobid.ro`;

        await supabaseAdmin
          .from('user_notifications')
          .insert({
            user_id: userId,
            title: 'Bonus primit',
            message: bonusMessage,
            type: 'success',
            metadata: {
              type: 'admin_bonus',
              icon: 'gift-red',
              tokens_added: tokensAmount > 0 && tokensOperation === 'add' ? tokensAmount : 0,
              credits_added: creditAmount > 0 && creditOperation === 'add' ? creditAmount : 0,
              from: 'gobid.ro',
              admin_user_id: authenticatedUser.id,
              admin_email: authenticatedUser.email,
              note: note ?? null,
            },
          });

        await sendUserPushNotification({
          userId,
          title: 'Bonus gobid.ro',
          body: bonusMessage,
          data: {
            type: 'admin_bonus',
          },
        });
      } catch (notificationError) {
        console.error('Failed to create admin bonus notification:', notificationError);
        // Nu blocăm operațiunea de update tokens/credits dacă notificarea eșuează.
      }
    }

    return NextResponse.json({
      success: true,
      tokens: {
        balance,
        totalEarned,
        totalSpent,
        level: startingTokens.level ?? 'Basic',
      },
      payment: paymentRecord,
    });
  } catch (error) {
    console.error('Unexpected error updating user tokens/credit:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}







