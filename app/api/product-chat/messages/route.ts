import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { sendUserPushNotification } from '@/lib/push/sendUserPushNotification';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    // Obține user-ul autentificat din Authorization header (similar cu alte API routes)
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    let user: any = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Verifică token-ul folosind supabaseAdmin
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      
      const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !authUser?.user) {
        console.error('[API Product Chat GET] Auth error:', authError);
        return NextResponse.json(
          { error: 'Unauthorized', details: authError?.message || 'Invalid token' },
          { status: 401 }
        );
      }
      
      userId = authUser.user.id;
      user = authUser.user;
      console.log('[API Product Chat GET] Authenticated user from token:', userId);
    } else {
      // Nu există Authorization header
      console.error('[API Product Chat GET] No Authorization header found');
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing authorization token' },
        { status: 401 }
      );
    }

    // Folosește supabaseAdmin pentru operațiile pe baza de date (bypass RLS)
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const chatId = searchParams.get('chatId');
    const productId = searchParams.get('productId');
    const buyerId = searchParams.get('buyerId');

    if (!chatId && !productId) {
      return NextResponse.json(
        { error: 'chatId or productId is required' },
        { status: 400 }
      );
    }

    let chat;

    // Dacă avem productId și buyerId, găsim sau creăm conversația
    if (productId && buyerId) {
      console.log('[API Product Chat GET] Request params:', { productId, buyerId, userId: user.id });
      
      // Verifică dacă utilizatorul este vânzătorul sau cumpărătorul
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('user_id')
        .eq('id', productId)
        .single();

      if (productError) {
        console.error('[API Product Chat GET] Product error:', productError);
        return NextResponse.json(
          { error: 'Product not found', details: productError.message },
          { status: 404 }
        );
      }

      if (!product) {
        console.error('[API Product Chat GET] Product not found for productId:', productId);
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }

      const productSellerId = product.user_id;
      console.log('[API Product Chat GET] Product seller ID:', productSellerId, 'Current user ID:', user.id, 'Buyer ID from request:', buyerId);
      
      // Determină corect buyerId și sellerId bazat pe utilizatorul curent
      // Dacă utilizatorul curent este vânzătorul produsului, atunci buyerId este cel trimis
      // Dacă utilizatorul curent este cumpărătorul, atunci buyerId este user.id
      let actualBuyerId: string;
      let actualSellerId: string;
      
      if (user.id === productSellerId) {
        // Utilizatorul curent este vânzătorul
        actualSellerId = user.id;
        actualBuyerId = buyerId; // buyerId trimis este cumpărătorul
        console.log('[API Product Chat GET] Current user is seller. Actual buyer:', actualBuyerId, 'Actual seller:', actualSellerId);
      } else if (user.id === buyerId) {
        // Utilizatorul curent este cumpărătorul
        actualBuyerId = user.id;
        actualSellerId = productSellerId;
        console.log('[API Product Chat GET] Current user is buyer. Actual buyer:', actualBuyerId, 'Actual seller:', actualSellerId);
      } else {
        // Utilizatorul nu este nici vânzător, nici cumpărător
        console.error('[API Product Chat GET] Unauthorized: user is neither seller nor buyer', {
          userId: user.id,
          productSellerId,
          buyerId
        });
        return NextResponse.json({ error: 'Unauthorized: You are not the seller or buyer for this product' }, { status: 403 });
      }

      // Găsește conversația existentă (caută după product_id și buyer/seller corecți)
      console.log('[API Product Chat GET] Searching for existing chat:', { productId, actualBuyerId, actualSellerId });
      const { data: existingChat, error: existingChatError } = await supabaseAdmin
        .from('product_chats')
        .select('*')
        .eq('product_id', productId)
        .eq('buyer_user_id', actualBuyerId)
        .eq('seller_user_id', actualSellerId)
        .maybeSingle();

      if (existingChatError && existingChatError.code !== 'PGRST116') {
        console.error('[API Product Chat GET] Existing chat error:', existingChatError);
        return NextResponse.json(
          { error: 'Failed to search for chat', details: existingChatError.message },
          { status: 500 }
        );
      }

      // Chat-ul găsit este deja valid (am căutat cu buyer și seller corecți)
      let validChat = existingChat;

      if (validChat) {
        console.log('[API Product Chat GET] Found existing chat:', validChat.id);
        chat = validChat;
      } else {
        console.log('[API Product Chat GET] No existing chat found, creating new one');
        // Creează conversație nouă cu buyer și seller corecți
        const { data: newChat, error: createError } = await supabaseAdmin
          .from('product_chats')
          .insert({
            product_id: productId,
            buyer_user_id: actualBuyerId,
            seller_user_id: actualSellerId,
          })
          .select()
          .single();

        if (createError) {
          console.error('[API Product Chat GET] Create chat error:', createError);
          return NextResponse.json(
            { error: 'Failed to create chat', details: createError.message || JSON.stringify(createError) },
            { status: 500 }
          );
        }
        console.log('[API Product Chat GET] Created new chat:', newChat.id);
        chat = newChat;
      }
    } else if (chatId) {
      // Găsește conversația după ID
      const { data: foundChat, error: chatError } = await supabaseAdmin
        .from('product_chats')
        .select('*')
        .eq('id', chatId)
        .single();

      if (chatError || !foundChat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      // Verifică dacă utilizatorul are acces la conversație
      if (foundChat.buyer_user_id !== user.id && foundChat.seller_user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      chat = foundChat;
    }

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Obține mesajele
    console.log('[API Product Chat GET] Fetching messages for chat:', chat.id);
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('product_chat_messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[API Product Chat GET] Messages error:', messagesError);
      return NextResponse.json(
        { error: 'Failed to fetch messages', details: messagesError.message || JSON.stringify(messagesError) },
        { status: 500 }
      );
    }

    console.log('[API Product Chat GET] Successfully loaded', messages?.length || 0, 'messages', {
      chatId: chat.id,
      userId: user.id,
      chatBuyerId: chat.buyer_user_id,
      chatSellerId: chat.seller_user_id,
      systemMessagesCount: messages?.filter(m => m.is_system_message === true || m.sender_user_id === null).length || 0,
      messages: messages?.map(m => ({
        id: m.id,
        sender_user_id: m.sender_user_id,
        is_system_message: m.is_system_message,
        message_text: m.message_text?.substring(0, 50),
        created_at: m.created_at
      }))
    });

    // Marchează mesajele ca citite pentru utilizatorul curent
    // (mesajele de sistem sunt marcate ca citite pentru toți participanții)
    if (messages && messages.length > 0) {
      // Marchează mesajele normale (nu de la utilizatorul curent)
      const updateNormalResult = await supabaseAdmin
        .from('product_chat_messages')
        .update({ is_read: true })
        .eq('chat_id', chat.id)
        .neq('sender_user_id', user.id)
        .not('sender_user_id', 'is', null)
        .eq('is_read', false);
      
      // Marchează mesajele de sistem (sender_user_id NULL) ca citite
      const updateSystemResult = await supabaseAdmin
        .from('product_chat_messages')
        .update({ is_read: true })
        .eq('chat_id', chat.id)
        .is('sender_user_id', null)
        .eq('is_read', false);
      
      if (updateNormalResult.error) {
        console.error('[API Product Chat GET] Error marking normal messages as read:', updateNormalResult.error);
      }
      if (updateSystemResult.error) {
        console.error('[API Product Chat GET] Error marking system messages as read:', updateSystemResult.error);
      }
      if (!updateNormalResult.error && !updateSystemResult.error) {
        console.log('[API Product Chat GET] Marked messages as read for user:', user.id);
      }
    }

    return NextResponse.json({
      chat,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('[API Product Chat GET] Unexpected error:', error);
    console.error('[API Product Chat GET] Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message || String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Obține user-ul autentificat din Authorization header (similar cu alte API routes)
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    let user: any = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Verifică token-ul folosind supabaseAdmin
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      
      const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !authUser?.user) {
        console.error('[API Product Chat POST] Auth error:', authError);
        return NextResponse.json(
          { error: 'Unauthorized', details: authError?.message || 'Invalid token' },
          { status: 401 }
        );
      }
      
      userId = authUser.user.id;
      user = authUser.user;
      console.log('[API Product Chat POST] Authenticated user from token:', userId);
    } else {
      // Nu există Authorization header
      console.error('[API Product Chat POST] No Authorization header found');
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing authorization token' },
        { status: 401 }
      );
    }

    // Folosește supabaseAdmin pentru operațiile pe baza de date (bypass RLS)
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('[API Product Chat POST] Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid request body', details: parseError.message },
        { status: 400 }
      );
    }
    
    const { chatId, productId, buyerId, messageText } = body;

    // Verifică dacă există text sau imagini în mesaj (imagini sunt incluse în messageText ca [IMAGE:url])
    const hasText = messageText && messageText.trim().length > 0;
    const hasImages = messageText && /\[IMAGE:(.+?)\]/g.test(messageText);
    
    if (!hasText && !hasImages) {
      return NextResponse.json(
        { error: 'Message text or images are required' },
        { status: 400 }
      );
    }
    
    console.log('[API Product Chat POST] Received message request:', {
      hasChatId: !!chatId,
      hasProductId: !!productId,
      hasBuyerId: !!buyerId,
      messageLength: messageText?.length,
      messageText: messageText ? messageText.substring(0, 100) : '(empty)',
      hasText: hasText,
      hasImages: hasImages,
      isSystemMessage: body.isSystemMessage,
      userId: user.id
    });

    // Filtrare cuvinte jignitoare
    const profanityWords = [
      'pula', 'pizda', 'pizdă', 'pula mea', 'pula ta', 'pula lui',
      'dute in pizda matii', 'du-te în pizda mă-tii', 'du-te în pizda mății',
      'esti prost', 'ești prost', 'esti idiot', 'ești idiot',
      'mortii matii', 'morții mă-tii', 'morții mății',
      'futu-te', 'futuți', 'futut', 'futui',
      'cacat', 'căcat', 'cacatul', 'căcatul',
      'muie', 'muia', 'muie la', 'muia ta',
      'cur', 'curu', 'curul',
      'pizde', 'pizdă', 'pizdele',
      'prost', 'prostu', 'prostule',
      'idiot', 'idiotu', 'idiotule',
      'retardat', 'retardatu', 'retardatule',
      'tampit', 'tâmpit', 'tampitu', 'tâmpitu',
      'cretin', 'cretinu', 'cretinule',
      'bou', 'boule', 'boul',
      'golan', 'golanu', 'golanule',
      'nesimtit', 'nesimțit', 'nesimtitu', 'nesimțitu',
      'imbecil', 'îmbecil', 'imbecili', 'îmbeci',
      'cretin', 'cretini', 'cretinule',
      'pula calului', 'pula cailor',
      'sa te fut', 'să te fut', 'sa te futi', 'să te fuți',
      'fututi mortii', 'futuți morții',
      'dute dracului', 'du-te dracului',
      'sa ma fut', 'să mă fut',
      'futu-ti', 'futuți', 'futu-ți',
      'pizda mamei', 'pizda mămei',
      'pizda ma-tii', 'pizda mă-tii',
      'pizda matii', 'pizda mății',
      'mortii tai', 'morții tăi',
      'mortii matii', 'morții mă-tii',
      'mortii mamei', 'morții mamei',
      'mortii ma-tii', 'morții mă-tii',
      'sa te iau', 'să te iau',
      'ia-te', 'ia te',
      'sa te ia', 'să te ia',
      'futu-ti mama', 'futuți mama', 'futu-ți mama',
      'futu-ti ma-ta', 'futuți ma-ta', 'futu-ți mă-ta',
      'futu-ti mortii', 'futuți morții', 'futu-ți morții',
    ];

    // Normalizează textul pentru verificare (lowercase, fără diacritice parțial)
    const normalizeText = (text: string) => {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimină diacriticele
        .replace(/[^\w\s]/g, ' '); // Înlocuiește caracterele speciale cu spații
    };

    const normalizedMessage = normalizeText(messageText);
    const words = normalizedMessage.split(/\s+/);

    // Verifică dacă mesajul conține cuvinte jignitoare
    const containsProfanity = profanityWords.some(profanity => {
      const normalizedProfanity = normalizeText(profanity);
      // Verifică dacă cuvântul jignitor apare ca cuvânt complet sau ca parte a unui cuvânt
      return normalizedMessage.includes(normalizedProfanity) || 
             words.some(word => word.includes(normalizedProfanity));
    });

    if (containsProfanity) {
      return NextResponse.json(
        { error: 'Mesajul conține cuvinte jignitoare. Te rugăm să fii respectuos în conversație.' },
        { status: 400 }
      );
    }

    let chat;

    // Dacă avem productId și buyerId, găsim sau creăm conversația
    if (productId && buyerId) {
      // Verifică dacă utilizatorul este vânzătorul sau cumpărătorul
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('user_id')
        .eq('id', productId)
        .single();

      if (productError) {
        console.error('[API Product Chat POST] Product error:', productError);
      }

      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }

      const productSellerId = product.user_id;
      
      // Determină corect buyerId și sellerId bazat pe utilizatorul curent
      let actualBuyerId: string;
      let actualSellerId: string;
      
      if (user.id === productSellerId) {
        // Utilizatorul curent este vânzătorul
        actualSellerId = user.id;
        actualBuyerId = buyerId; // buyerId trimis este cumpărătorul
      } else if (user.id === buyerId) {
        // Utilizatorul curent este cumpărătorul
        actualBuyerId = user.id;
        actualSellerId = productSellerId;
      } else {
        // Utilizatorul nu este nici vânzător, nici cumpărător
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Găsește conversația existentă (caută după product_id și buyer/seller corecți)
      const { data: existingChat, error: existingChatError } = await supabaseAdmin
        .from('product_chats')
        .select('*')
        .eq('product_id', productId)
        .eq('buyer_user_id', actualBuyerId)
        .eq('seller_user_id', actualSellerId)
        .maybeSingle();

      if (existingChatError && existingChatError.code !== 'PGRST116') {
        console.error('[API Product Chat POST] Existing chat error:', existingChatError);
      }

      // Chat-ul găsit este deja valid (am căutat cu buyer și seller corecți)
      let validChat = existingChat;

      if (validChat) {
        chat = validChat;
        
        // Verifică dacă conversația este hidden pentru userul curent și o face vizibilă
        const currentHiddenIds = chat.hidden_by_user_ids || [];
        if (currentHiddenIds.includes(user.id)) {
          console.log('[API Product Chat POST] Unhiding conversation for user:', user.id);
          const updatedHiddenIds = currentHiddenIds.filter((id: string) => id !== user.id);
          
          const { error: unhideError } = await supabaseAdmin
            .from('product_chats')
            .update({ hidden_by_user_ids: updatedHiddenIds })
            .eq('id', chat.id);
          
          if (unhideError) {
            console.error('[API Product Chat POST] Error unhiding conversation:', unhideError);
            // Nu returnăm eroare, doar logăm - mesajul va fi trimis oricum
          } else {
            // Actualizează chat-ul local cu noua listă de hidden users
            chat.hidden_by_user_ids = updatedHiddenIds;
            console.log('[API Product Chat POST] Conversation unhidden successfully');
          }
        }
      } else {
        // Creează conversație nouă cu buyer și seller corecți
        const { data: newChat, error: createError } = await supabaseAdmin
          .from('product_chats')
          .insert({
            product_id: productId,
            buyer_user_id: actualBuyerId,
            seller_user_id: actualSellerId,
          })
          .select()
          .single();

        if (createError) {
          console.error('[API Product Chat POST] Create chat error:', createError);
          return NextResponse.json(
            { error: 'Failed to create chat', details: createError },
            { status: 500 }
          );
        }
        chat = newChat;
      }
    } else if (chatId) {
      // Găsește conversația după ID
      const { data: foundChat, error: chatError } = await supabaseAdmin
        .from('product_chats')
        .select('*')
        .eq('id', chatId)
        .single();

      if (chatError || !foundChat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      // Verifică dacă utilizatorul are acces la conversație
      if (foundChat.buyer_user_id !== user.id && foundChat.seller_user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      chat = foundChat;
      
      // Verifică dacă conversația este hidden pentru userul curent și o face vizibilă
      const currentHiddenIds = chat.hidden_by_user_ids || [];
      if (currentHiddenIds.includes(user.id)) {
        console.log('[API Product Chat POST] Unhiding conversation for user:', user.id);
        const updatedHiddenIds = currentHiddenIds.filter((id: string) => id !== user.id);
        
        const { error: unhideError } = await supabaseAdmin
          .from('product_chats')
          .update({ hidden_by_user_ids: updatedHiddenIds })
          .eq('id', chat.id);
        
        if (unhideError) {
          console.error('[API Product Chat POST] Error unhiding conversation:', unhideError);
          // Nu returnăm eroare, doar logăm - mesajul va fi trimis oricum
        } else {
          // Actualizează chat-ul local cu noua listă de hidden users
          chat.hidden_by_user_ids = updatedHiddenIds;
          console.log('[API Product Chat POST] Conversation unhidden successfully');
        }
      }
    } else {
      return NextResponse.json(
        { error: 'chatId or (productId and buyerId) is required' },
        { status: 400 }
      );
    }

    // Verifică dacă este mesaj de sistem
    const isSystemMessage = body.isSystemMessage === true;
    
    // Pentru mesaje de sistem, verificăm că utilizatorul are permisiunea
    // (doar vânzătorul sau cumpărătorul pot trimite mesaje de sistem)
    if (isSystemMessage) {
      // Verifică dacă utilizatorul este vânzător sau cumpărător
      const isAuthorized = chat.buyer_user_id === user.id || chat.seller_user_id === user.id;
      if (!isAuthorized) {
        return NextResponse.json(
          { error: 'Unauthorized: Only chat participants can send system messages' },
          { status: 403 }
        );
      }
    }
    
    // Construiește obiectul de insert
    // Folosește messageText dacă există, altfel string gol (pentru mesaje doar cu imagini)
    const insertData: any = {
      chat_id: chat.id,
      message_text: messageText ? messageText.trim() : '',
      is_read: false, // Mesajele noi sunt implicit necitite
    };
    
    // Dacă este mesaj de sistem, încercăm să setăm sender_user_id la null
    // Dacă migrarea nu a fost aplicată, folosim un workaround
    if (isSystemMessage) {
      // Încercăm mai întâi cu migrarea aplicată
      insertData.sender_user_id = null;
      insertData.is_system_message = true;
    } else {
      // Pentru mesajele normale, nu includem is_system_message pentru compatibilitate
      insertData.sender_user_id = user.id;
    }
    
    // Trimite mesajul
    console.log('[DEBUG API POST] Inserting message with data:', {
      chat_id: insertData.chat_id,
      has_sender_user_id: !!insertData.sender_user_id,
      sender_user_id: insertData.sender_user_id,
      has_is_system_message: 'is_system_message' in insertData,
      is_system_message: insertData.is_system_message,
      message_length: insertData.message_text?.length,
      fullInsertData: insertData
    });
    
    let message;
    let messageError;
    
    // Încearcă să insereze mesajul
    console.log('[DEBUG API POST] Executing database insert...');
    const insertResult = await supabaseAdmin
      .from('product_chat_messages')
      .insert(insertData)
      .select()
      .single();
    
    console.log('[DEBUG API POST] Insert result:', {
      hasData: !!insertResult.data,
      hasError: !!insertResult.error,
      messageId: insertResult.data?.id,
      errorCode: insertResult.error?.code,
      errorMessage: insertResult.error?.message,
      errorDetails: insertResult.error?.details
    });
    
    message = insertResult.data;
    messageError = insertResult.error;

    // Dacă eroarea este despre migrare și este mesaj de sistem, folosește workaround
    if (messageError && isSystemMessage) {
      const errorMessage = messageError.message || '';
      const errorDetails = messageError.details || '';
      const fullErrorText = `${errorMessage} ${errorDetails}`.toLowerCase();
      
      // Dacă eroarea este despre migrare, folosește workaround: trimite ca mesaj normal cu prefix special
      if (fullErrorText.includes('is_system_message') || 
          (fullErrorText.includes('sender_user_id') && fullErrorText.includes('null')) ||
          messageError.code === 'PGRST204') {
        console.log('[API Product Chat POST] Migration not applied, using workaround for system message');
        
        // Workaround: trimite ca mesaj normal dar cu prefix special pentru identificare în UI
        // Folosim un utilizator special sau prefixăm mesajul
        const workaroundData = {
          chat_id: chat.id,
          sender_user_id: user.id, // Folosim user.id pentru compatibilitate
          message_text: `[SYSTEM] ${messageText.trim()}`, // Prefix pentru identificare
          is_read: false, // Mesajele noi sunt implicit necitite
        };
        
        const workaroundResult = await supabaseAdmin
          .from('product_chat_messages')
          .insert(workaroundData)
          .select()
          .single();
        
        if (workaroundResult.error) {
          console.error('[API Product Chat POST] Workaround also failed:', workaroundResult.error);
          return NextResponse.json(
            { 
              error: 'Failed to send system message',
              details: workaroundResult.error.message || 'Unknown database error',
              code: workaroundResult.error.code,
            },
            { status: 500 }
          );
        }
        
        message = workaroundResult.data;
        messageError = null;
        
        // Adaugă flag pentru UI să știe că este mesaj de sistem
        if (message) {
          message.is_system_message = true;
          message.sender_user_id = null; // Setăm la null pentru UI
        }
      } else {
        // Altă eroare, returnează eroarea
        console.error('[API Product Chat POST] Insert error:', {
          code: messageError.code,
          message: messageError.message,
          details: messageError.details,
          hint: messageError.hint,
        });
        
        return NextResponse.json(
          { 
            error: 'Failed to send message', 
            details: messageError.message || 'Unknown database error',
            code: messageError.code,
            hint: messageError.hint
          },
          { status: 500 }
        );
      }
    } else if (messageError) {
      // Eroare pentru mesaj normal
      console.error('[API Product Chat POST] Insert error:', {
        code: messageError.code,
        message: messageError.message,
        details: messageError.details,
        hint: messageError.hint,
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to send message', 
          details: messageError.message || 'Unknown database error',
          code: messageError.code,
          hint: messageError.hint
        },
        { status: 500 }
      );
    }
    
    console.log('[DEBUG API POST] ✅ Message inserted successfully in database:', {
      messageId: message?.id,
      chatId: chat.id,
      senderId: user.id,
      messageText: message?.message_text,
      isSystemMessage: isSystemMessage,
      chatBuyerId: chat.buyer_user_id,
      chatSellerId: chat.seller_user_id,
      messageCreatedAt: message?.created_at,
      fullMessage: message
    });

    // Creează notificare pentru destinatar (doar pentru mesaje non-sistem)
    if (!isSystemMessage && message) {
      try {
        // Determină destinatarul (celălalt utilizator din chat)
        const recipientId = chat.buyer_user_id === user.id 
          ? chat.seller_user_id 
          : chat.buyer_user_id;

        // Obține numele utilizatorului care trimite mesajul
        const { data: senderProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .maybeSingle();

        const senderName = senderProfile 
          ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Utilizator'
          : 'Utilizator';

        // Obține informații despre produs pentru notificare
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('title, slug')
          .eq('id', chat.product_id)
          .maybeSingle();

        const productTitle = product?.title || 'Produs';
        const productSlug = product?.slug || '';

        // Creează notificarea
        const notificationMessage = `${senderName} v-a trimis un mesaj pentru "${productTitle}"`;
        
        await supabaseAdmin
          .from('user_notifications')
          .insert({
            user_id: recipientId,
            title: 'Mesaj nou',
            message: notificationMessage,
            type: 'info',
            metadata: {
              type: 'product_chat_message',
              chat_id: chat.id,
              product_id: chat.product_id,
              product_slug: productSlug,
              sender_id: user.id,
              message_id: message.id
            }
          });

        await sendUserPushNotification({
          userId: recipientId,
          title: 'Mesaj nou',
          body: notificationMessage,
          data: {
            type: 'product_chat_message',
            product_id: String(chat.product_id),
            chat_id: String(chat.id),
          },
        });

        console.log('[API Product Chat POST] Notification created for user:', recipientId);
      } catch (notificationError) {
        console.error('[API Product Chat POST] Error creating notification:', notificationError);
        // Nu returnăm eroare dacă notificarea eșuează, mesajul a fost trimis cu succes
      }
    }

    // Verifică dacă mesajul a fost inserat corect
    if (!message) {
      console.error('[API Product Chat POST] Message is null after insert!');
      return NextResponse.json(
        { error: 'Message was not inserted correctly' },
        { status: 500 }
      );
    }
    
    console.log('[DEBUG API POST] Returning response to client:', {
      messageId: message.id,
      messageText: message.message_text,
      senderId: message.sender_user_id,
      chatId: chat.id,
      hasMessage: !!message,
      chatBuyerId: chat.buyer_user_id,
      chatSellerId: chat.seller_user_id
    });
    
    return NextResponse.json({
      success: true,
      message,
      chat,
    });
  } catch (error: any) {
    console.error('[API Product Chat POST] Unexpected error:', error);
    console.error('[API Product Chat POST] Error stack:', error?.stack);
    console.error('[API Product Chat POST] Error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      details: error?.details
    });
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error?.message || String(error) || 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

