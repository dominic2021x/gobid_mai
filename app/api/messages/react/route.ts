import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Helper to get auth client from request
async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  
  const { data: { user } } = await supabase.auth.getUser(token);
  return user ? { supabase, user } : null;
}

// POST - Add or update reaction (like/unlike)
export async function POST(request: NextRequest) {
  try {
    const authData = await getAuthClient(request);
    if (!authData) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const { user } = authData;
    const body = await request.json();
    const { messageId, messageType, reactionType } = body;

    if (!messageId || !messageType || !reactionType) {
      return NextResponse.json({ error: 'Lipsesc parametrii necesari' }, { status: 400 });
    }

    if (!['product_chat', 'report_chat'].includes(messageType)) {
      return NextResponse.json({ error: 'Tip mesaj invalid' }, { status: 400 });
    }

    // Acceptă orice emoji ca reacție
    if (!reactionType || typeof reactionType !== 'string' || reactionType.trim().length === 0) {
      return NextResponse.json({ error: 'Tip reacție invalid' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Verifică dacă există deja o reacție de același tip
    const { data: existingReaction, error: checkError } = await admin
      .from('message_reactions')
      .select('id, reaction_type')
      .eq('message_id', messageId)
      .eq('message_type', messageType)
      .eq('user_id', user.id)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing reaction:', checkError);
      return NextResponse.json({ error: 'Eroare la verificarea reacției' }, { status: 500 });
    }

    // Dacă există deja aceeași reacție, șterge-o (toggle off)
    if (existingReaction) {
      const { error: deleteError } = await admin
        .from('message_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (deleteError) {
        console.error('Error deleting reaction:', deleteError);
        return NextResponse.json({ error: 'Eroare la ștergerea reacției' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'removed' });
    }

    // Pentru WhatsApp-style: utilizatorul poate avea multiple emoji-uri diferite la același mesaj
    // Nu mai ștergem alte reacții, doar adăugăm cea nouă

    // Adaugă reacția nouă
    const { data: newReaction, error: insertError } = await admin
      .from('message_reactions')
      .insert({
        message_id: messageId,
        message_type: messageType,
        user_id: user.id,
        reaction_type: reactionType,
      })
      .select()
      .single();

    if (insertError) {
      // Verifică dacă este eroare de constraint (duplicat)
      if (insertError.code === '23505') {
        // Reacția există deja (race condition), returnează success
        return NextResponse.json({ success: true, action: 'added' });
      }
      console.error('Error inserting reaction:', insertError);
      return NextResponse.json({ error: 'Eroare la adăugarea reacției' }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: 'added', reaction: newReaction });
  } catch (error: any) {
    console.error('Error in reaction POST:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}

// GET - Get reactions for a message
export async function GET(request: NextRequest) {
  try {
    const authData = await getAuthClient(request);
    if (!authData) {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const { user } = authData;
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const messageType = searchParams.get('messageType');

    if (!messageId || !messageType) {
      return NextResponse.json({ error: 'Lipsesc parametrii necesari' }, { status: 400 });
    }

    if (!['product_chat', 'report_chat'].includes(messageType)) {
      return NextResponse.json({ error: 'Tip mesaj invalid' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configurare Supabase incompletă' }, { status: 500 });
    }

    const admin = supabaseAdmin;

    // Obține toate reacțiile pentru mesaj
    const { data: reactions, error: reactionsError } = await admin
      .from('message_reactions')
      .select('reaction_type, user_id')
      .eq('message_id', messageId)
      .eq('message_type', messageType);

    if (reactionsError) {
      console.error('Error fetching reactions:', reactionsError);
      return NextResponse.json({ error: 'Eroare la încărcarea reacțiilor' }, { status: 500 });
    }

    // Grupează reactions după emoji și numără câte sunt din fiecare
    const reactionGroups: Record<string, { count: number; userIds: string[] }> = {};
    
    reactions?.forEach(r => {
      if (!reactionGroups[r.reaction_type]) {
        reactionGroups[r.reaction_type] = { count: 0, userIds: [] };
      }
      reactionGroups[r.reaction_type].count++;
      reactionGroups[r.reaction_type].userIds.push(r.user_id);
    });

    // Găsește emoji-urile date de utilizatorul curent
    const userReactions = reactions?.filter(r => r.user_id === user.id).map(r => r.reaction_type) || [];

    return NextResponse.json({
      reactions: reactionGroups,
      userReactions,
    });
  } catch (error: any) {
    console.error('Error in reaction GET:', error);
    return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  }
}
