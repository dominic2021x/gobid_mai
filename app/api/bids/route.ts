/**
 * API Route - Bids (Oferte)
 * POST /api/bids - Creează o ofertă nouă
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { sendUserPushNotification } from '@/lib/push/sendUserPushNotification';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, amount, is_private, autoAccept } = body;

    console.log('🎯 [API /api/bids] Received request:', { product_id, amount, is_private, autoAccept });

    // Validare
    if (!product_id || !amount) {
      console.error('❌ [API /api/bids] Validation failed:', { product_id, amount });
      return NextResponse.json(
        { error: 'product_id și amount sunt obligatorii' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Suma trebuie să fie mai mare decât 0' },
        { status: 400 }
      );
    }

    const authUser = await getRequestAuthUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Neautorizat. Te rugăm să te autentifici.' },
        { status: 401 }
      );
    }
    const userId = authUser.id;

    if (!supabaseAdmin) {
      console.error('[API Bids] supabaseAdmin is not configured');
      console.error('[API Bids] SUPABASE_SERVICE_ROLE_KEY exists?', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      console.error('[API Bids] SUPABASE_SERVICE_ROLE exists?', !!process.env.SUPABASE_SERVICE_ROLE);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    console.log('[API Bids] supabaseAdmin is configured:', !!supabaseAdmin);

    // Verifică dacă produsul există și obține informații despre el
    // Verifică dacă product_id este un UUID valid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let product: any = null;
    let productError: any = null;

    console.log('[API Bids] Received product_id:', product_id, 'Type:', typeof product_id);
    console.log('[API Bids] Is UUID?', uuidRegex.test(product_id));

    if (uuidRegex.test(product_id)) {
      // Dacă este UUID, caută direct după ID
      console.log('[API Bids] Searching product by UUID:', product_id);
      console.log('[API Bids] supabaseAdmin available?', !!supabaseAdmin);
      
      if (!supabaseAdmin) {
        console.error('[API Bids] supabaseAdmin is null! Cannot query database.');
        return NextResponse.json(
          { error: 'Server configuration error: supabaseAdmin not available' },
          { status: 500 }
        );
      }
      
      const result = await supabaseAdmin
        .from('products')
        .select('id, user_id, starting_price_ron, starting_price_eur, slug, product_type, status')
        .eq('id', product_id)
        .maybeSingle(); // Folosim maybeSingle în loc de single pentru a evita erori dacă nu există
      
      product = result.data;
      productError = result.error;
      console.log('[API Bids] UUID search result:', { 
        product, 
        productError,
        hasProduct: !!product,
        productId: product?.id,
        productSlug: product?.slug,
        productType: product?.product_type,
        productStatus: product?.status,
        errorCode: productError?.code,
        errorMessage: productError?.message,
        errorDetails: productError,
        resultData: result.data,
        resultError: result.error
      });
      
      // Dacă nu găsește cu UUID, verifică dacă există produse cu ID similar
      if (!product && !productError) {
        console.log('[API Bids] Product not found by UUID, checking if product exists with different filters...');
        // Încearcă fără filtre pentru a vedea dacă produsul există dar nu este vizibil din alt motiv
        const { data: anyProduct, error: anyError } = await supabaseAdmin
          .from('products')
          .select('id, slug, product_type, status, user_id, created_at')
          .eq('id', product_id)
          .maybeSingle();
        console.log('[API Bids] Product check (no filters):', { anyProduct, anyError });
        
        // Dacă găsește produsul fără filtre, verifică de ce nu a fost găsit cu filtrele inițiale
        if (anyProduct) {
          console.log('[API Bids] Product EXISTS but was not returned by initial query!', {
            id: anyProduct.id,
            slug: anyProduct.slug,
            product_type: anyProduct.product_type,
            status: anyProduct.status,
            user_id: anyProduct.user_id
          });
          // Folosește produsul găsit
          product = anyProduct;
        } else {
          // Verifică dacă există vreun produs cu acest ID în alt mod
          console.log('[API Bids] Checking if product exists at all...');
          const { count, error: countError } = await supabaseAdmin
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('id', product_id);
          console.log('[API Bids] Product count check:', { count, countError });
        }
      }
    } else {
      // Dacă nu este UUID, caută după slug
      console.log('[API Bids] Searching product by slug:', product_id);
      console.log('[API Bids] supabaseAdmin available?', !!supabaseAdmin);
      
      // Caută produsul după slug - fără filtre de status pentru a găsi orice produs
      // Vom verifica status-ul după ce găsim produsul
      console.log('[API Bids] Searching for slug (exact match):', product_id);
      let result = await supabaseAdmin
        .from('products')
        .select('id, user_id, starting_price_ron, starting_price_eur, slug, product_type, status')
        .eq('slug', product_id)
        .eq('product_type', 'live-bid')
        .maybeSingle();
      
      product = result.data;
      productError = result.error;
      console.log('[API Bids] Slug search result (exact match):', { 
        product, 
        productError,
        hasProduct: !!product,
        productId: product?.id,
        productSlug: product?.slug,
        productType: product?.product_type,
        productStatus: product?.status,
        searchedSlug: product_id,
        slugMatch: product?.slug === product_id
      });
      
      // Dacă nu găsește, încearcă fără filtru de product_type (poate există o problemă)
      if (!product && !productError) {
        console.log('[API Bids] Product not found with product_type filter, trying without...');
        const resultNoType = await supabaseAdmin
          .from('products')
          .select('id, user_id, starting_price_ron, starting_price_eur, slug, product_type, status')
          .eq('slug', product_id)
          .maybeSingle();
        
        console.log('[API Bids] Slug search result (no product_type filter):', {
          product: resultNoType.data,
          productError: resultNoType.error,
          hasProduct: !!resultNoType.data,
          productId: resultNoType.data?.id,
          productSlug: resultNoType.data?.slug,
          productType: resultNoType.data?.product_type,
          productStatus: resultNoType.data?.status
        });
        
        if (resultNoType.data) {
          // Dacă găsește produsul dar nu este live-bid, returnează eroare
          if (resultNoType.data.product_type !== 'live-bid') {
            console.error('[API Bids] Product found but wrong type:', resultNoType.data.product_type);
            return NextResponse.json(
              { error: 'Produsul nu este de tip Live Bid' },
              { status: 400 }
            );
          }
          // Dacă este live-bid, folosește-l
          product = resultNoType.data;
        }
      }
      
      // Dacă tot nu găsește, verifică dacă există produse cu slug similar pentru debugging
      if (!product && !productError) {
        console.log('[API Bids] Product not found, checking if any products exist with similar slug...');
        const { data: allProducts, count } = await supabaseAdmin
          .from('products')
          .select('id, slug, product_type, status', { count: 'exact' })
          .ilike('slug', `%${product_id}%`)
          .limit(5);
        console.log('[API Bids] Similar products found:', { allProducts, count });
        
        // Dacă găsește un singur produs similar, încearcă să-l folosească
        if (allProducts && allProducts.length === 1 && allProducts[0].product_type === 'live-bid') {
          console.log('[API Bids] Found one similar product, using it:', allProducts[0]);
          const { data: foundProduct } = await supabaseAdmin
            .from('products')
            .select('id, user_id, starting_price_ron, starting_price_eur, slug, product_type, status')
            .eq('id', allProducts[0].id)
            .single();
          if (foundProduct) {
            product = foundProduct;
          }
        }
      }
      
      // Dacă produsul există, verifică dacă este de tip live-bid și nu este șters
      if (product) {
        console.log('[API Bids] Product found, checking conditions:', {
          product_type: product.product_type,
          status: product.status,
          isLiveBid: product.product_type === 'live-bid',
          isNotDeleted: product.status !== 'deleted',
          isActive: product.status === 'active',
          userId: userId,
          productUserId: product.user_id,
          isOwner: product.user_id === userId
        });
        
        if (product.product_type !== 'live-bid') {
          console.error('[API Bids] Product is not a live-bid:', product.product_type);
          return NextResponse.json(
            { error: 'Produsul nu este de tip Live Bid' },
            { status: 400 }
          );
        }
        
        if (product.status === 'deleted') {
          console.error('[API Bids] Product is deleted');
          return NextResponse.json(
            { error: 'Produsul a fost șters' },
            { status: 404 }
          );
        }
        
        // Verifică dacă produsul este 'active' sau 'reserved', sau dacă utilizatorul este proprietar (poate licita la draft sau reserved)
        // Proprietarul poate face contraoferte chiar dacă produsul este 'reserved'
        if (product.status !== 'active' && product.status !== 'reserved' && product.user_id !== userId) {
          console.error('[API Bids] Product is not active/reserved and user is not owner:', {
            status: product.status,
            userId: userId,
            productUserId: product.user_id
          });
          return NextResponse.json(
            { error: 'Produsul nu este disponibil pentru licitație. Doar produsele active sau rezervate pot primi oferte.' },
            { status: 403 }
          );
        }
        
        // Dacă produsul este 'reserved' și utilizatorul nu este proprietar, nu permitem oferte noi
        if (product.status === 'reserved' && product.user_id !== userId) {
          console.error('[API Bids] Product is reserved and user is not owner:', {
            status: product.status,
            userId: userId,
            productUserId: product.user_id
          });
          return NextResponse.json(
            { error: 'Produsul este rezervat. Doar vânzătorul poate face contraoferte.' },
            { status: 403 }
          );
        }
      }
    }

    if (productError || !product) {
      console.error('[API Bids] Product not found:', { 
        product_id, 
        productError,
        errorCode: productError?.code,
        errorMessage: productError?.message,
        errorDetails: productError,
        isUUID: uuidRegex.test(product_id),
        searchedAs: uuidRegex.test(product_id) ? 'UUID' : 'slug'
      });
      
      // Verificare suplimentară: încearcă să găsească produsul fără filtre
      if (uuidRegex.test(product_id)) {
        console.log('[API Bids] Attempting fallback search without any filters...');
        const { data: fallbackProduct, error: fallbackError } = await supabaseAdmin
          .from('products')
          .select('id, slug, product_type, status')
          .eq('id', product_id)
          .maybeSingle();
        
        console.log('[API Bids] Fallback search result:', { fallbackProduct, fallbackError });
        
        if (fallbackProduct) {
          console.log('[API Bids] Product found in fallback search, but was filtered out. Product details:', {
            id: fallbackProduct.id,
            slug: fallbackProduct.slug,
            product_type: fallbackProduct.product_type,
            status: fallbackProduct.status
          });
        }
      }
      
      return NextResponse.json(
        { error: 'Produsul nu a fost găsit' },
        { status: 404 }
      );
    }
    
    console.log('[API Bids] Product found successfully:', { 
      id: product.id, 
      slug: product.slug,
      product_type: product.product_type,
      status: product.status,
      starting_price_ron: product.starting_price_ron,
      starting_price_eur: product.starting_price_eur
    });

    // Verifică dacă utilizatorul încearcă să facă ofertă la propriul produs
    // Permitem doar dacă este o contraoferta (executorul poate plasa contraoferte)
    const isOwnerBid = product.user_id === userId;
    
    // Folosește UUID-ul real al produsului pentru toate query-urile
    const actualProductId = product.id;
    
    // Obține toate ofertele pentru acest produs, ordonate cronologic
    const { data: allBids, error: allBidsError } = await supabaseAdmin
      .from('bids')
      .select('id, user_id, created_at')
      .eq('product_id', actualProductId)
      .order('created_at', { ascending: true });
    
    if (allBidsError || !allBids) {
      console.error('[API Bids] Error fetching bids:', allBidsError);
    }
    
    // Numără contraofertele consecutive de la utilizatorul curent fără răspuns
    let consecutiveCounterOffers = 0;
    if (allBids && allBids.length > 0) {
      // Parcurgem ofertele de la sfârșitul listei (cele mai recente) înapoi
      for (let i = allBids.length - 1; i >= 0; i--) {
        const bid = allBids[i];
        if (bid.user_id === userId) {
          // Ofertă de la utilizatorul curent - incrementăm contorul
          consecutiveCounterOffers++;
        } else {
          // Ofertă de la alt utilizator - întrerupe șirul de contraoferte consecutive
          break;
        }
      }
    }
    
    // Limitare la 100 contraoferte consecutive fără răspuns (pentru testare)
    if (consecutiveCounterOffers >= 100) {
      return NextResponse.json(
        { 
          error: 'Ai făcut deja 100 contraoferte consecutive. Te rugăm să aștepți un răspuns înainte de a face o nouă contraofertă.',
          consecutiveCounterOffers: consecutiveCounterOffers
        },
        { status: 400 }
      );
    }
    
    const isCounterOffer = consecutiveCounterOffers > 0; // Dacă utilizatorul are oferte recente, este contraoferta
    
    // Validare: Oferta minimă trebuie să fie cel puțin 33% din prețul anunțului
    // DOAR pentru prima ofertă (nu pentru contraoferte)
    // Pentru contraoferte, permitem orice sumă (mai mică sau mai mare decât ultima)
    if (!isCounterOffer) {
      const startingPrice = product.starting_price_ron || 0;
      const minimumBidAmount = Math.ceil(startingPrice * 0.33); // 33% din preț, rotunjit în sus
      
      if (startingPrice > 0 && amount < minimumBidAmount) {
        return NextResponse.json(
          { 
            error: `Oferta minimă este ${minimumBidAmount} Lei (33% din prețul anunțului de ${startingPrice} Lei)`,
            minimumBidAmount: minimumBidAmount,
            startingPrice: startingPrice
          },
          { status: 400 }
        );
      }
    }
    console.log('[API Bids] Using actual product ID for queries:', actualProductId);
    
    // Obține oferta curentă maximă pentru acest produs
    const { data: maxBidData, error: maxBidError } = await supabaseAdmin
      .from('bids')
      .select('amount, user_id')
      .eq('product_id', actualProductId)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Dacă nu există oferte anterioare, folosește prețul de start
    const currentMaxBid = maxBidData?.amount || product.starting_price_ron || 0;
    
    if (isOwnerBid) {
      // Vânzătorul poate face oferte (contraoferte) oricând, chiar dacă nu există oferte de la alți utilizatori
      // Aceasta permite vânzătorului să inițieze negocieri
      const { data: otherBids } = await supabaseAdmin
        .from('bids')
        .select('id, amount')
        .eq('product_id', actualProductId)
        .neq('user_id', userId)
        .order('amount', { ascending: false })
        .limit(1);
      
      const maxOtherBid = otherBids?.[0]?.amount || 0;
      console.log('[API Bids] Owner placing counter-offer:', { 
        amount, 
        maxOtherBid,
        hasOtherBids: otherBids && otherBids.length > 0
      });
    } else {
      // Pentru utilizatori normali, permitem orice ofertă (fără limită minimă sau maximă)
      console.log('[API Bids] User placing bid:', { amount, currentMaxBid });
    }

    // Marchează ofertele anterioare de la același utilizator ca fiind outbid
    // (când utilizatorul face o contraofertă nouă, oferta anterioară devine outbid)
    await supabaseAdmin
      .from('bids')
      .update({ is_outbid: true })
      .eq('product_id', actualProductId)
      .eq('user_id', userId)
      .neq('is_winning', true) // Nu marcăm ofertele acceptate ca outbid
      .is('is_outbid', false); // Doar ofertele care nu sunt deja outbid
    
    // Marchează oferta anterioară de la celălalt utilizator ca fiind refuzată (outbid)
    // când se face o contraofertă nouă
    if (allBids && allBids.length > 0) {
      // Găsește ultima ofertă de la un utilizator diferit (celălalt utilizator)
      for (let i = allBids.length - 1; i >= 0; i--) {
        const bid = allBids[i];
        if (bid.user_id !== userId) {
          // Aceasta este ultima ofertă de la celălalt utilizator - o marchează ca refuzată
          await supabaseAdmin
            .from('bids')
            .update({ is_outbid: true })
            .eq('id', bid.id)
            .neq('is_winning', true); // Nu marcăm ofertele acceptate ca refuzate
          break; // Oprim după ce am marcat ultima ofertă de la celălalt utilizator
        }
      }
    }

    // Creează oferta nouă
    // TOATE ofertele sunt create cu is_winning: false - vânzătorul trebuie să le accepte manual
    // Chiar și "Cumpără acum" nu acceptă automat oferta
    
    console.log('📝 [API /api/bids] Attempting to insert bid:', {
      product_id: actualProductId,
      user_id: userId,
      amount,
      is_winning: false, // NICIODATĂ auto-accept
      is_private: is_private || false
    });

    const { data: newBid, error: bidError } = await supabaseAdmin
      .from('bids')
      .insert([
        {
          product_id: actualProductId,
          user_id: userId,
          amount,
          is_winning: false, // TOATE ofertele încep ca neacceptate
          is_outbid: false,
          is_private: is_private || false,
        },
      ])
      .select()
      .single();

    if (bidError) {
      console.error('❌ [API /api/bids] Error creating bid:', bidError);
      console.error('❌ [API /api/bids] Error details:', {
        message: bidError.message,
        details: bidError.details,
        hint: bidError.hint,
        code: bidError.code
      });
      return NextResponse.json(
        { error: bidError.message || 'Eroare la crearea ofertei' },
        { status: 500 }
      );
    }

    if (!newBid) {
      console.error('❌ [API /api/bids] Bid insert returned null!');
      return NextResponse.json(
        { error: 'Oferta nu a fost creată - rezultat null' },
        { status: 500 }
      );
    }

    console.log('✅ [API /api/bids] Bid created successfully:', {
      bidId: newBid.id,
      productId: actualProductId,
      userId: userId,
      amount,
      is_winning: newBid.is_winning, // Întotdeauna false - vânzătorul trebuie să accepte manual
      created_at: newBid.created_at
    });

    // NU marchează produsul ca 'reserved' la auto-accept - rămâne 'active' până când vânzătorul acceptă manual
    // Produsul va fi marcat ca 'reserved' doar când vânzătorul acceptă oferta în /api/bids/accept
    // if (isAutoAccepted && newBid) {
    //   await supabaseAdmin
    //     .from('products')
    //     .update({ status: 'reserved' })
    //     .eq('id', actualProductId);
    //   
    //   console.log('🔒 [API /api/bids] Product marked as reserved (auto-accept):', actualProductId);
    // }

    // Creează notificare pentru vânzător (dacă oferta nu este de la vânzător)
    if (!isOwnerBid && newBid) {
      try {
        // Obține numele utilizatorului care a făcut oferta
        const { data: bidderProfile } = await supabaseAdmin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('user_id', userId)
          .maybeSingle();

        const bidderName = bidderProfile 
          ? `${bidderProfile.first_name || ''} ${bidderProfile.last_name || ''}`.trim() || 'Utilizator'
          : 'Utilizator';

        // Obține informații despre produs
        const { data: productInfo } = await supabaseAdmin
          .from('products')
          .select('title, slug')
          .eq('id', actualProductId)
          .maybeSingle();

        const productTitle = productInfo?.title || 'Produs';
        const productSlug = productInfo?.slug || '';

        // Creează notificarea pentru vânzător
        const notificationMessage = `${bidderName} a făcut o ofertă de ${amount} Lei pentru "${productTitle}"`;
        
        await supabaseAdmin
          .from('user_notifications')
          .insert({
            user_id: product.user_id, // Vânzătorul
            title: 'Ofertă nouă',
            message: notificationMessage,
            type: 'info',
            metadata: {
              type: 'bid',
              product_id: actualProductId,
              product_slug: productSlug,
              bid_id: newBid.id,
              amount: amount,
              bidder_id: userId
            }
          });

        await sendUserPushNotification({
          userId: product.user_id,
          title: 'Ofertă nouă',
          body: notificationMessage,
          data: {
            type: 'bid',
            product_id: String(actualProductId),
          },
        });

        console.log('[API Bids] Notification created for seller:', product.user_id);
      } catch (notificationError) {
        console.error('[API Bids] Error creating notification:', notificationError);
        // Nu returnăm eroare dacă notificarea eșuează
      }
    }

    // Verifică dacă există o conversație pentru acest produs și o creează dacă nu există
    try {
      const sellerId = product.user_id;
      const buyerId = userId;
      
      console.log('[API Bids] Checking/creating conversation for:', { productId: actualProductId, buyerId, sellerId });
      
      // Găsește conversația existentă (poate fi hidden)
      const { data: existingChat, error: chatError } = await supabaseAdmin
        .from('product_chats')
        .select('id, hidden_by_user_ids, buyer_user_id, seller_user_id')
        .eq('product_id', actualProductId)
        .eq('buyer_user_id', buyerId)
        .eq('seller_user_id', sellerId)
        .maybeSingle();

      if (!chatError && existingChat) {
        console.log('[API Bids] Conversation exists, unhiding if needed...');
        // Dacă conversația există și este hidden pentru userul curent, o face vizibilă
        const currentHiddenIds = existingChat.hidden_by_user_ids || [];
        if (currentHiddenIds.includes(userId)) {
          console.log('[API Bids] Unhiding conversation for user:', userId);
          const updatedHiddenIds = currentHiddenIds.filter((id: string) => id !== userId);
          
          const { error: unhideError } = await supabaseAdmin
            .from('product_chats')
            .update({ hidden_by_user_ids: updatedHiddenIds })
            .eq('id', existingChat.id);
          
          if (unhideError) {
            console.error('[API Bids] Error unhiding conversation:', unhideError);
            // Nu returnăm eroare, doar logăm - oferta a fost creată cu succes
          } else {
            console.log('[API Bids] Conversation unhidden successfully');
          }
        }
        
        // Dacă conversația este hidden pentru vânzător și oferta este de la cumpărător, o face vizibilă și pentru vânzător
        if (!isOwnerBid && currentHiddenIds.includes(sellerId)) {
          console.log('[API Bids] Unhiding conversation for seller:', sellerId);
          const updatedHiddenIds = currentHiddenIds.filter((id: string) => id !== sellerId);
          
          const { error: unhideError } = await supabaseAdmin
            .from('product_chats')
            .update({ hidden_by_user_ids: updatedHiddenIds })
            .eq('id', existingChat.id);
          
          if (unhideError) {
            console.error('[API Bids] Error unhiding conversation for seller:', unhideError);
          } else {
            console.log('[API Bids] Conversation unhidden for seller successfully');
          }
        }
      } else {
        // Conversația nu există - o creează
        console.log('[API Bids] Conversation does not exist, creating new one...');
        
        const { data: newChat, error: createChatError } = await supabaseAdmin
          .from('product_chats')
          .insert({
            product_id: actualProductId,
            buyer_user_id: buyerId,
            seller_user_id: sellerId,
            hidden_by_user_ids: []
          })
          .select()
          .single();
        
        if (createChatError) {
          console.error('[API Bids] Error creating conversation:', createChatError);
        } else {
          console.log('[API Bids] ✅ New conversation created:', newChat.id);
        }
      }
    } catch (chatCheckError) {
      console.error('[API Bids] Error checking/creating conversation:', chatCheckError);
      // Nu returnăm eroare, doar logăm - oferta a fost creată cu succes
    }

    // NU trimitem mesaje automate în chat - frontend-ul generează automat mesajele bazate pe bids
    // Mesajele sunt afișate de frontend în funcție de isMyBid (Ai trimis/Ai primit)
    // Acest lucru evită mesajele duplicate
    console.log('📨 [API /api/bids] Bid created successfully, frontend will handle chat messages');
    
    console.log('📨 [API /api/bids] Returning success response:', {
      bidId: newBid.id,
      productId: actualProductId,
      requiresManualAccept: true // Toate ofertele necesită acceptare manuală
    });

    return NextResponse.json(
      { 
        success: true, 
        bid: newBid,
        message: 'Oferta a fost plasată cu succes!' 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/bids:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create bid' },
      { status: 500 }
    );
  }
}
