import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


function sanitizeTransactionDescription(raw: unknown): string {
  const text = String(raw || '');
  return text
    .replace(/(Returnare token aprobată pentru anunț)\s+[A-Z0-9-]{3,}\s*-\s*/i, '$1 ')
    .replace(/\s*\[product_id:[^\]]+\]/gi, '')
    .trim();
}

/** Extrage product_id din descriere pentru tranzacții deblocare (pentru dashboard/exclusiv). */
function extractProductIdFromDescription(raw: unknown): string | null {
  const text = String(raw || '');
  if (!/deblocare produs/i.test(text)) return null;
  const m = text.match(/\[product_id:([a-f0-9-]{8,})\]/i);
  return m ? m[1].trim() : null;
}

/** Extrage titlul din descriere (pentru tranzacții vechi fără [product_id:]). */
function extractTitleFromDescription(raw: unknown): string {
  const text = String(raw || '');
  const m = text.match(/deblocare produs:\s*([\s\S]+?)(?:\s*\[product_id:|$)/i);
  return m ? m[1].trim().slice(0, 150) : '';
}

// GET - Obține tranzacțiile pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
    }
    const userId = authUser.id;

    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('token_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (transactionsError) {
      console.error('Failed to fetch transactions:', transactionsError);
      return NextResponse.json({ error: 'Cannot read transactions' }, { status: 500 });
    }

    // Transformă datele pentru frontend (productId pentru deblocări – folosit pe dashboard/exclusiv)
    const formattedTransactions = (transactions || []).map(t => {
      const description = sanitizeTransactionDescription(t.description);
      const isUnlockFlow = /deblocare|re-deblocare|returnare token/i.test(description);
      const productId = extractProductIdFromDescription(t.description);
      return {
        id: t.transaction_id || t.id,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        date: t.date,
        description,
        paymentMethod: t.payment_method || (isUnlockFlow ? 'Token Support' : ''),
        productId: productId || undefined,
        tokensReceived: t.tokens_received,
        tokensSpent: t.tokens_spent,
        tokensTransferred: t.tokens_transferred,
        recipientEmail: t.recipient_email,
        recipientName: t.recipient_name,
        message: t.message
      };
    });

    // Pentru tranzacții vechi fără [product_id:] – rezolvăm productId după titlu ca să apară toate pe exclusiv
    for (let i = 0; i < (transactions || []).length; i++) {
      const t = (transactions as any[])[i];
      if (formattedTransactions[i].productId) continue;
      if (String(t?.type || '') !== 'spent') continue;
      const raw = String(t?.description || '');
      if (!/deblocare produs/i.test(raw)) continue;
      const title = extractTitleFromDescription(raw);
      if (!title || title.length < 4) continue;
      const { data: row } = await supabaseAdmin
        .from('products')
        .select('id')
        .ilike('title', `%${title}%`)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(1);
      if (row?.[0]?.id) formattedTransactions[i].productId = String((row[0] as { id: string }).id);
    }

    return NextResponse.json(formattedTransactions);
  } catch (error) {
    console.error('Unexpected error fetching transactions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Creează o nouă tranzacție
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    const sessionUser = await getRequestAuthUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
    }
    const userId = sessionUser.id;
    const userEmail = sessionUser.email || '';
    const body = await request.json();

    const {
      transactionId,
      type,
      amount,
      status = 'completed',
      date,
      description,
      paymentMethod,
      tokensReceived,
      tokensSpent,
      tokensTransferred,
      recipientEmail,
      recipientName,
      message
    } = body;

    const { data: newTransaction, error: insertError } = await supabaseAdmin
      .from('token_transactions')
      .insert({
        user_id: userId,
        user_email: userEmail,
        transaction_id: transactionId || `TKN-${Date.now()}`,
        type,
        amount,
        status,
        date: date || new Date().toISOString().split('T')[0],
        description,
        payment_method: paymentMethod,
        tokens_received: tokensReceived,
        tokens_spent: tokensSpent,
        tokens_transferred: tokensTransferred,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        message
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create transaction:', insertError);
      return NextResponse.json({ error: 'Cannot create transaction' }, { status: 500 });
    }

    return NextResponse.json({
      id: newTransaction.transaction_id || newTransaction.id,
      type: newTransaction.type,
      amount: Number(newTransaction.amount),
      status: newTransaction.status,
      date: newTransaction.date,
      description: newTransaction.description
    });
  } catch (error) {
    console.error('Unexpected error creating transaction:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



