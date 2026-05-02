import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = supabaseAdmin;
    if (!client) {
      return NextResponse.json({ balance: 0, userId: user.id }, { status: 200 });
    }

    const { data: tokensRow, error: tokensError } = await client
      .from('user_tokens')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokensError) {
      console.error('Error fetching user tokens:', tokensError);
      return NextResponse.json({ balance: 0 }, { status: 200 });
    }

    return NextResponse.json({ 
      balance: tokensRow?.balance ?? 0,
      userId: user.id
    }, { status: 200 });

  } catch (error) {
    console.error('Error in tokens/balance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
