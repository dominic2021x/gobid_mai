import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// POST - Add or toggle reaction (like/dislike)
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const body = await request.json();
    const { targetUserId, reactionType } = body;

    if (!targetUserId || !reactionType) {
      return NextResponse.json({ error: 'Lipsesc parametrii necesari' }, { status: 400 });
    }

    if (!['like', 'dislike'].includes(reactionType)) {
      return NextResponse.json({ error: 'Tip reacție invalid' }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Nu poți da reacție propriului profil' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    const { data: existingReaction, error: checkError } = await admin
      .from('user_reactions')
      .select('id, reaction_type')
      .eq('user_id', user.id)
      .eq('target_user_id', targetUserId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing reaction:', checkError);
      return NextResponse.json({ error: 'Eroare la verificarea reacției' }, { status: 500 });
    }

    if (existingReaction && existingReaction.reaction_type === reactionType) {
      const { error: deleteError } = await admin
        .from('user_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (deleteError) {
        console.error('Error deleting reaction:', deleteError);
        return NextResponse.json({ error: 'Eroare la ștergerea reacției' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'removed' });
    }

    if (existingReaction && existingReaction.reaction_type !== reactionType) {
      const { error: updateError } = await admin
        .from('user_reactions')
        .update({ reaction_type: reactionType, updated_at: new Date().toISOString() })
        .eq('id', existingReaction.id);

      if (updateError) {
        console.error('Error updating reaction:', updateError);
        return NextResponse.json({ error: 'Eroare la actualizarea reacției' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'updated' });
    }

    const { data: newReaction, error: insertError } = await admin
      .from('user_reactions')
      .insert({
        user_id: user.id,
        target_user_id: targetUserId,
        reaction_type: reactionType,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, action: 'added' });
      }
      console.error('Error inserting reaction:', insertError);
      return NextResponse.json({ error: 'Eroare la adăugarea reacției' }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: 'added', reaction: newReaction });
  } catch (error: unknown) {
    console.error('Error in reaction POST:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('targetUserId');

    if (!targetUserId) {
      return NextResponse.json({ error: 'Lipsește targetUserId' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    const { data: reactions, error: reactionsError } = await admin
      .from('user_reactions')
      .select('reaction_type, user_id')
      .eq('target_user_id', targetUserId);

    if (reactionsError) {
      console.error('Error fetching reactions:', reactionsError);
      return NextResponse.json({ error: 'Eroare la încărcarea reacțiilor' }, { status: 500 });
    }

    const likeCount = reactions?.filter((r) => r.reaction_type === 'like').length || 0;
    const dislikeCount = reactions?.filter((r) => r.reaction_type === 'dislike').length || 0;

    const userReaction = reactions?.find((r) => r.user_id === user.id)?.reaction_type || null;

    return NextResponse.json({
      likeCount,
      dislikeCount,
      userReaction,
    });
  } catch (error: unknown) {
    console.error('Error in reaction GET:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('targetUserId');

    if (!targetUserId) {
      return NextResponse.json({ error: 'Lipsește targetUserId' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    const { error: deleteError } = await admin
      .from('user_reactions')
      .delete()
      .eq('user_id', user.id)
      .eq('target_user_id', targetUserId);

    if (deleteError) {
      console.error('Error deleting reaction:', deleteError);
      return NextResponse.json({ error: 'Eroare la ștergerea reacției' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in reaction DELETE:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}
