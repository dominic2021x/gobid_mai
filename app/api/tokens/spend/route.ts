import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const { amount, reason, productId } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const cleanProductId = typeof productId === 'string' ? productId.trim() : '';
    const baseDescription = reason || 'Token spent';
    // Append product_id marker so /api/tokens/unlocked-products and exclusiv can recover all unlocks from transaction history.
    const transactionDescription = cleanProductId
      ? `${baseDescription} [product_id:${cleanProductId}]`
      : baseDescription;

    // Prevent duplicate charges for the same product unlock.
    // We reserve unlock ownership first; if row already exists, request is idempotent.
    let reservedUnlock = false;
    if (cleanProductId.length > 0) {
      const { data: unlockInsertRows, error: unlockInsertError } = await supabaseAdmin
        .from('user_unlocked_products')
        .upsert(
          {
            user_id: user.id,
            product_id: cleanProductId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,product_id', ignoreDuplicates: true }
        )
        .select('product_id');

      if (unlockInsertError) {
        console.error('Error reserving unlock ownership:', unlockInsertError);
        return NextResponse.json({ error: 'Could not process unlock request' }, { status: 500 });
      }

      reservedUnlock = Array.isArray(unlockInsertRows) && unlockInsertRows.length > 0;

      if (!reservedUnlock) {
        const { data: existingTokens } = await supabaseAdmin
          .from('user_tokens')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle();

        return NextResponse.json(
          {
            success: true,
            alreadyUnlocked: true,
            newBalance: existingTokens?.balance ?? 0,
          },
          { status: 200 }
        );
      }
    }

    // Get current balance from user_tokens (same table as /api/tokens and header)
    const { data: tokensRow, error: tokensError } = await supabaseAdmin
      .from('user_tokens')
      .select('balance, total_spent')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokensError) {
      console.error('Error fetching user_tokens:', tokensError);
      return NextResponse.json({ error: 'Could not fetch profile' }, { status: 500 });
    }

    const currentBalance = tokensRow?.balance ?? 0;

    if (currentBalance < amount) {
      // Rollback reserved unlock row if we couldn't charge tokens.
      if (cleanProductId.length > 0 && reservedUnlock) {
        try {
          await supabaseAdmin
            .from('user_unlocked_products')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', cleanProductId);
        } catch (rollbackError) {
          console.warn('Could not rollback reserved unlock after insufficient balance:', rollbackError);
        }
      }
      return NextResponse.json({ 
        error: 'Insufficient tokens',
        balance: currentBalance 
      }, { status: 400 });
    }

    const newBalance = currentBalance - amount;
    const newTotalSpent = (tokensRow?.total_spent ?? 0) + amount;

    const { error: updateError } = await supabaseAdmin
      .from('user_tokens')
      .update({ balance: newBalance, total_spent: newTotalSpent })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating user_tokens:', updateError);
      if (cleanProductId.length > 0 && reservedUnlock) {
        try {
          await supabaseAdmin
            .from('user_unlocked_products')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', cleanProductId);
        } catch (rollbackError) {
          console.warn('Could not rollback reserved unlock after token update failure:', rollbackError);
        }
      }
      return NextResponse.json({ error: 'Could not update tokens' }, { status: 500 });
    }

    try {
      await supabaseAdmin.from('token_transactions').insert({
        user_id: user.id,
        user_email: user.email || '',
        transaction_id: `TKN-SPEND-${Date.now()}`,
        status: 'completed',
        date: new Date().toISOString().split('T')[0],
        amount: -amount,
        type: 'spent',
        description: transactionDescription,
        payment_method: 'Token Support',
        tokens_spent: amount,
        created_at: new Date().toISOString()
      });
    } catch (txError) {
      console.warn('Could not log transaction:', txError);
    }

    // Post-unlock bookkeeping for product unlock flow.
    if (cleanProductId.length > 0 && reservedUnlock) {
      try {
        // If this product was re-locked after an approved refund request,
        // mark approved requests as refunded once the user unlocks again.
        await supabaseAdmin
          .from('token_refund_requests')
          .update({ status: 'refunded' })
          .eq('user_id', user.id)
          .eq('product_id', cleanProductId)
          .eq('status', 'approved');
      } catch (unlockError) {
        console.warn('Could not persist unlocked product history:', unlockError);
      }
    }

    return NextResponse.json({ 
      success: true,
      newBalance: currentBalance - amount 
    }, { status: 200 });

  } catch (error) {
    console.error('Error in tokens/spend:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
