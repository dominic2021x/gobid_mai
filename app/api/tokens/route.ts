import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getApiAuthIdentity } from '@/lib/auth/getApiAuthIdentity';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET - Obține tokens pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const identity = await getApiAuthIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
    }
    const { userId, email: identityEmail } = identity;
    const userEmail = identityEmail ?? '';

    console.log('[Tokens API GET] Fetching tokens for user:', {
      userId,
      userEmail
    });

    // Obține tokens pentru user - NU crea record nou dacă nu există
    // Folosim supabaseAdmin pentru a ocoli RLS
    console.log('[Tokens API GET] Querying user_tokens with supabaseAdmin for userId:', userId);

    const { data: tokensRow, error: tokensError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[Tokens API GET] Query result:', {
      tokensRow: tokensRow ? {
        id: tokensRow.id,
        user_id: tokensRow.user_id,
        balance: tokensRow.balance,
        total_earned: tokensRow.total_earned,
        total_spent: tokensRow.total_spent,
        level: tokensRow.level,
        package_type: tokensRow.package_type
      } : null,
      tokensError: tokensError ? {
        message: tokensError.message,
        code: tokensError.code,
        details: tokensError.details
      } : null,
      hasTokensRow: !!tokensRow,
      queryUserId: userId,
      matchUserId: tokensRow?.user_id === userId
    });
    
    // Debug: Verifică dacă există record-uri pentru acest user
    const { data: allTokens, error: allTokensError } = await supabaseAdmin
      .from('user_tokens')
      .select('user_id, balance, user_email')
      .limit(20);
    
    console.log('[Tokens API GET] All tokens in DB (first 20):', allTokens);
    console.log('[Tokens API GET] Looking for userId:', userId);
    console.log('[Tokens API GET] Matching userIds in DB:', allTokens?.filter((t: any) => t.user_id === userId));

    // Handle errors - PGRST116 means "no rows returned" which is expected if user has no tokens yet
    // Other errors might be recoverable, so we'll log them but still try to return defaults
    if (tokensError && tokensError.code !== 'PGRST116') {
      console.error('[Tokens API GET] Database error fetching user tokens:', {
        code: tokensError.code,
        message: tokensError.message,
        details: tokensError.details,
        hint: tokensError.hint
      });
      
      // For certain errors, we can still return defaults instead of failing
      // This prevents the UI from breaking when there are minor database issues
      const recoverableErrors = ['PGRST301', 'PGRST302']; // Connection/timeout errors
      if (recoverableErrors.includes(tokensError.code)) {
        console.warn('[Tokens API GET] Recoverable error, returning defaults');
        return NextResponse.json({
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: 'Basic',
          package: 'Basic'
        });
      }
      
      // For other errors, return a more informative error message
      return NextResponse.json({ 
        error: 'Cannot read token balance',
        details: tokensError.message || 'Database query failed'
      }, { status: 500 });
    }

    // Dacă nu există record, returnează 0 (nu se creează automat)
    if (!tokensRow) {
      console.log('[Tokens API GET] No tokens record found, returning defaults');
      return NextResponse.json({
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        level: 'Basic',
        package: 'Basic'
      });
    }

    console.log('[Tokens API GET] Returning tokens:', {
      balance: tokensRow.balance,
      totalEarned: tokensRow.total_earned,
      totalSpent: tokensRow.total_spent,
      level: tokensRow.level,
      package: tokensRow.package_type
    });

    // Returnează valorile reale din baza de date, cu fallback la valori default dacă sunt null/undefined
    return NextResponse.json({
      balance: tokensRow.balance ?? 0,
      totalEarned: tokensRow.total_earned ?? 0,
      totalSpent: tokensRow.total_spent ?? 0,
      level: tokensRow.level ?? 'Basic',
      package: tokensRow.package_type ?? 'Basic'
    });
  } catch (error) {
    console.error('Unexpected error fetching user tokens:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT - Actualizează tokens pentru user-ul curent
export async function PUT(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const identity = await getApiAuthIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
    }
    let { userId, email: userEmail } = identity;
    userEmail = userEmail ?? '';

    if (!userEmail) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('email')
        .eq('user_id', userId)
        .maybeSingle();
      if (profile?.email) {
        userEmail = profile.email;
      }
    }
    const body = await request.json();
    const { balance, totalEarned, totalSpent, level, package: packageType } = body;

    // Verifică dacă există deja un record
    const { data: existingTokens } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Folosește valorile din request dacă sunt furnizate, altfel folosește valorile existente
    // IMPORTANT: Verificăm explicit pentru undefined/null, nu pentru 0 (care este o valoare validă)
    const finalBalance = balance !== undefined && balance !== null ? balance : (existingTokens?.balance ?? 0);
    const finalTotalEarned = totalEarned !== undefined && totalEarned !== null ? totalEarned : (existingTokens?.total_earned ?? 0);
    const finalTotalSpent = totalSpent !== undefined && totalSpent !== null ? totalSpent : (existingTokens?.total_spent ?? 0);
    const finalLevel = level !== undefined && level !== null ? level : (existingTokens?.level ?? 'Basic');
    const finalPackageType = packageType !== undefined && packageType !== null ? packageType : (existingTokens?.package_type ?? 'Basic');

    console.log('[Tokens API] Updating tokens:', {
      userId,
      requestBalance: balance,
      existingBalance: existingTokens?.balance,
      finalBalance,
      requestTotalSpent: totalSpent,
      existingTotalSpent: existingTokens?.total_spent,
      finalTotalSpent
    });

    console.log('[Tokens API PUT] Upserting tokens with values:', {
      user_id: userId,
      user_email: userEmail,
      balance: finalBalance,
      total_earned: finalTotalEarned,
      total_spent: finalTotalSpent,
      level: finalLevel,
      package_type: finalPackageType
    });

    const { data: updatedTokens, error: updateError } = await supabaseAdmin
      .from('user_tokens')
      .upsert({
        user_id: userId,
        user_email: userEmail,
        balance: finalBalance,
        total_earned: finalTotalEarned,
        total_spent: finalTotalSpent,
        level: finalLevel,
        package_type: finalPackageType
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (updateError) {
      console.error('[Tokens API PUT] Failed to update user tokens:', updateError);
      return NextResponse.json({ error: 'Cannot update token balance' }, { status: 500 });
    }

    console.log('[Tokens API PUT] Successfully updated tokens:', {
      balance: updatedTokens.balance,
      totalEarned: updatedTokens.total_earned,
      totalSpent: updatedTokens.total_spent,
      level: updatedTokens.level,
      package: updatedTokens.package_type
    });

    return NextResponse.json({
      balance: updatedTokens.balance,
      totalEarned: updatedTokens.total_earned,
      totalSpent: updatedTokens.total_spent,
      level: updatedTokens.level,
      package: updatedTokens.package_type
    });
  } catch (error) {
    console.error('Unexpected error updating user tokens:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

