import { NextRequest, NextResponse } from 'next/server';
import { getBearerOrCookieAuthUser } from '@/lib/auth/getRequestAuthUser';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


type UserBlockRow = {
  blocker_user_id: string;
  blocked_user_id: string;
  blocked?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getBearerOrCookieAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { blockedUserId, block } = await request.json();

    if (!blockedUserId || typeof block !== 'boolean') {
      return NextResponse.json({ error: 'Missing blockedUserId or block parameter' }, { status: 400 });
    }

    if (user.id === blockedUserId) {
      return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });
    }

    // Verifică dacă există deja o înregistrare (folosim supabaseAdmin pentru a bypass RLS)
    const client = supabaseAdmin || supabase;
    const { data: existingBlock, error: checkError } = await client
      .from('user_blocks')
      .select('id')
      .eq('blocker_user_id', user.id)
      .eq('blocked_user_id', blockedUserId)
      .maybeSingle();

    // Dacă eroarea este despre tabel inexistent, returnează un mesaj clar
    if (checkError) {
      const errorMsg = checkError.message || '';
      const errorCode = checkError.code || '';
      if (errorMsg.includes('schema cache') || errorMsg.includes('relation') || errorCode === 'PGRST116') {
        return NextResponse.json(
          { 
            error: 'Tabelul user_blocks nu există. Te rog rulează SQL-ul din supabase/migrations/create_user_blocks_table.sql în Supabase SQL Editor.',
            code: 'TABLE_NOT_FOUND'
          },
          { status: 500 }
        );
      }
      // Dacă este o altă eroare, o propagăm mai departe
      throw checkError;
    }

    if (block) {
      // Blochează utilizatorul
      if (existingBlock) {
        // Există deja, actualizează
        const { error: updateError } = await client
          .from('user_blocks')
          .update({ 
            blocked: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingBlock.id);

        if (updateError) throw updateError;
      } else {
        // Creează nouă înregistrare
        const { error: insertError } = await client
          .from('user_blocks')
          .insert({
            blocker_user_id: user.id,
            blocked_user_id: blockedUserId,
            blocked: true
          });

        if (insertError) throw insertError;
      }
    } else {
      // Deblochează utilizatorul
      if (existingBlock) {
        const { error: updateError } = await client
          .from('user_blocks')
          .update({ 
            blocked: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingBlock.id);

        if (updateError) throw updateError;
      }
      // Dacă nu există înregistrare, înseamnă că nu este blocat, deci nu facem nimic
    }

    return NextResponse.json({ success: true, blocked: block });
  } catch (error: any) {
    console.error('[user/block] Error:', error);
    let errorMessage = 'Failed to block/unblock user';
    if (error) {
      if (typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message) || errorMessage;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = String(error) || errorMessage;
      }
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getBearerOrCookieAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verifică dacă utilizatorul curent a blocat pe cineva sau este blocat de cineva (folosim supabaseAdmin pentru a bypass RLS)
    const client = supabaseAdmin || supabase;
    const { data: blocks, error } = await client
      .from('user_blocks')
      .select('blocked_user_id, blocker_user_id, blocked')
      .or(`blocker_user_id.eq.${user.id},blocked_user_id.eq.${user.id}`)
      .eq('blocked', true);

    // Dacă eroarea este despre tabel inexistent, returnează array gol
    if (error && (error.message?.includes('schema cache') || error.message?.includes('relation') || error.code === 'PGRST116')) {
      return NextResponse.json({
        blockedByMe: [],
        blockedMe: []
      });
    }

    if (error) throw error;

    // Separa blocurile în două categorii
    const blockedByMe =
      (blocks as UserBlockRow[] | null)
        ?.filter((b: UserBlockRow) => b.blocker_user_id === user.id)
        .map((b: UserBlockRow) => b.blocked_user_id) || [];

    const blockedMe =
      (blocks as UserBlockRow[] | null)
        ?.filter((b: UserBlockRow) => b.blocked_user_id === user.id)
        .map((b: UserBlockRow) => b.blocker_user_id) || [];

    return NextResponse.json({
      blockedByMe,
      blockedMe
    });
  } catch (error: any) {
    console.error('[user/block GET] Error:', error);
    let errorMessage = 'Failed to fetch blocked users';
    if (error) {
      if (typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message) || errorMessage;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = String(error) || errorMessage;
      }
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
