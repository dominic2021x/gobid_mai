import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


function getReasonLabel(reason: string): string {
  switch (reason) {
    case 'spam': return 'Spam sau mesaje nedorite';
    case 'harassment': return 'Hărțuire sau comportament abuziv';
    case 'fake': return 'Cont fals sau fraudulos';
    case 'inappropriate': return 'Conținut neadecvat';
    case 'scam': return 'Înșelătorie sau scam';
    case 'other': return 'Alt motiv';
    default: return reason;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      productTitle,
      reportedUserName,
      reporterName,
      reason,
      description,
      conversationId,
      productId,
      reportedUserId
    } = body;

    // Validare câmpuri obligatorii
    if (!productTitle || !reportedUserName || !reporterName || !reason || !description) {
      return NextResponse.json(
        { error: 'Toate câmpurile sunt obligatorii' },
        { status: 400 }
      );
    }

    // Validare lungime minimă pentru descriere
    if (description.length < 20) {
      return NextResponse.json(
        { error: 'Descrierea trebuie să conțină minim 20 de caractere' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

    // Inserează raportul
    const { data: report, error: insertError } = await client
      .from('user_reports')
      .insert({
        reporter_user_id: authUser.id,
        reported_user_id: reportedUserId || null,
        product_id: productId || null,
        conversation_id: conversationId || null,
        product_title: productTitle,
        reported_user_name: reportedUserName,
        reporter_name: reporterName,
        reason: reason,
        description: description,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API Report] Insert error:', insertError);
      console.error('[API Report] Insert error details:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint
      });
      return NextResponse.json(
        { 
          error: 'Failed to create report', 
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
          fullError: insertError
        },
        { status: 500 }
      );
    }

    // Creează automat o conversație de chat pentru acest raport
    try {
      const { data: chat, error: chatError } = await client
        .from('report_chats')
        .insert({
          report_id: report.id,
          user_id: authUser.id,
          status: 'open'
        })
        .select()
        .single();

      if (chatError) {
        console.error('[API Report] Error creating report chat:', chatError);
        // Nu returnăm eroare aici, raportul a fost creat deja
      } else if (chat) {
        // Creează un mesaj sistem de bun venit din partea "Raportare Useri"
        const welcomeMessage = `GoBid mesaj automat: Bine ai venit în chat-ul de raportare! Am primit raportul tău despre "${productTitle}" și îl vom examina în cel mai scurt timp. Îți vom răspunde aici când vom avea un update.`;
        
        await client
          .from('report_chat_messages')
          .insert({
            chat_id: chat.id,
            sender_user_id: null, // NULL pentru mesaje de sistem
            is_admin: false,
            is_system_message: true,
            message_text: welcomeMessage,
            is_read: false
          });

        // Adaugă mesajul cu descrierea raportului
        await client
          .from('report_chat_messages')
          .insert({
            chat_id: chat.id,
            sender_user_id: authUser.id,
            is_admin: false,
            is_system_message: false,
            message_text: `Raport despre: ${reportedUserName}\n\nMotiv: ${getReasonLabel(reason)}\n\nDescriere:\n${description}`,
            is_read: false
          });
      }
    } catch (chatCreateError) {
      console.error('[API Report] Error creating chat or messages:', chatCreateError);
      // Nu returnăm eroare, raportul a fost creat cu succes
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error('[API Report] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const authed = await getRequestAuthUser(request);
    if (!authed?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verifică dacă utilizatorul este admin
    const ADMIN_ROLES = ['admin', 'superadmin', 'administrator', 'super_user', 'manager'];
    
    // Verifică mai întâi metadata (verificare rapidă)
    const user = authed;
    const isAdminFromMetadata = 
      user?.user_metadata?.is_admin === true || 
      user?.app_metadata?.is_admin === true;
    
    const metaRole =
      user?.user_metadata?.role ||
      user?.app_metadata?.role ||
      (Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles[0] : undefined);

    const roles = new Set<string>();
    if (metaRole) roles.add(String(metaRole).toLowerCase());
    if (Array.isArray(user?.app_metadata?.roles)) {
      user.app_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
    }
    if (user?.user_metadata?.roles && Array.isArray(user.user_metadata.roles)) {
      user.user_metadata.roles.forEach((r: string) => roles.add(String(r).toLowerCase()));
    }

    const isAdminFromRoles = Array.from(roles).some((role) => ADMIN_ROLES.includes(role));
    
    // Verifică user_profiles ca fallback
    let isAdminFromProfile = false;
    try {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('user_id', authed.id)
        .maybeSingle();

      if (!profileError && profile && profile.is_admin === true) {
        isAdminFromProfile = true;
      }
    } catch (e) {
      console.error('[API Report] Error checking admin status in user_profiles:', e);
    }

    const isAdmin = isAdminFromMetadata || isAdminFromRoles || isAdminFromProfile;

    const client = supabaseAdmin || supabase;

    // Obține parametrii de filtrare
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = client
      .from('user_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Dacă nu este admin, poate vedea doar propriile rapoarte
    if (!isAdmin) {
      query = query.eq('reporter_user_id', authed.id) as any;
    }

    // Filtrare după status dacă este specificat
    if (status) {
      query = query.eq('status', status) as any;
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('[API Report] Get error:', error);
      console.error('[API Report] Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return NextResponse.json(
        { 
          error: 'Failed to fetch reports', 
          details: error.message,
          code: error.code,
          hint: error.hint
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, reports: reports || [] });
  } catch (error: any) {
    console.error('[API Report] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
