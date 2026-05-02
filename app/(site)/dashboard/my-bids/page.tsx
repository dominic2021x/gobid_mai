"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  hasDashboardLocalAuthEvidence,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import UserReviews from "@/components/UserReviews";
import ProductChat from "@/components/ProductChat";

interface Bid {
  id: string;
  amount: number;
  created_at: string;
  is_winning: boolean;
  is_outbid: boolean;
  product_id: string;
  user_id?: string;
  user_profiles?: {
    user_id: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  } | null;
  user_rating?: {
    avgRating: number;
    reviewCount: number;
  } | null;
  product?: {
    id: string;
    title: string;
    slug: string;
    image: string;
    startingPrice: number;
    currency: string;
    product_type: string;
    user_id?: string;
    owner?: {
      userId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      username?: string;
      avatar_url?: string;
    };
    ownerRating?: {
      avgRating: number;
      reviewCount: number;
    } | null;
  };
}

export default function MyBidsPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatsWithoutBids, setChatsWithoutBids] = useState<Array<{
    product: any;
    sellerId: string;
    sellerInfo: any;
    bids: Bid[];
  }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewUserId, setSelectedReviewUserId] = useState<string | null>(null);
  const [selectedReviewProductId, setSelectedReviewProductId] = useState<string | null>(null);
  const [selectedReviewType, setSelectedReviewType] = useState<'seller' | 'buyer' | null>(null);
  const [selectedReviewUserInfo, setSelectedReviewUserInfo] = useState<{
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
  } | null>(null);
  const [acceptedBids, setAcceptedBids] = useState<Record<string, { bidId: string; acceptedAt: number }>>({});
  const [counterOfferExpirations, setCounterOfferExpirations] = useState<Record<string, { bidId: string; expiresAt: number }>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const firstLoadRef = useRef(true); // Flag pentru primul load (pentru a evita flash-ul de loading)
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatData, setChatData] = useState<{
    productId: string;
    buyerId: string;
    sellerId: string;
    otherUserInfo: { name: string; avatar?: string };
  } | null>(null);
  const [notificationModal, setNotificationModal] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'info',
  });
  
  // State pentru design-ul de chat
  const [selectedConversation, setSelectedConversation] = useState<{ productId: string; sellerId: string } | null>(null);
  const [newBidAmount, setNewBidAmount] = useState<Record<string, string>>({});
  const [newCounterOfferAmount, setNewCounterOfferAmount] = useState<Record<string, string>>({});
  // State pentru mesaje necitite: key = `${productId}-${sellerId}`, value = număr de mesaje necitite
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  
  // State pentru modal contraoferta (pentru chat)
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [counterOfferModalData, setCounterOfferModalData] = useState<{
    productId: string;
    bidId: string;
    currentAmount: number;
    currency: string;
    userName: string;
  } | null>(null);
  const [counterOfferAmount, setCounterOfferAmount] = useState<string>('');
  
  // State pentru mesajele prietenoase în chat
  const [chatSystemMessages, setChatSystemMessages] = useState<Record<string, Array<{
    id: string;
    message: string;
    timestamp: number;
    isAlert?: boolean;
  }>>>({});
  // Ref pentru a urmări ofertele procesate (pentru a evita duplicatele)
  const processedOffersRef = useRef<Set<string>>(new Set());
  
  // State pentru mesaje normale (chat)
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    sender_user_id: string | null;
    message_text: string;
    created_at: string;
    is_read: boolean;
    is_system_message?: boolean;
  }>>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const commonEmojis = ['😀', '😂', '🥰', '😍', '🤔', '👍', '❤️', '🎉', '🔥', '✅', '❌', '👏', '🙏', '😊', '😎', '🤗', '😴', '😢', '😡', '🤮'];

  // Auto-close notification modal pentru mesajele de succes
  useEffect(() => {
    if (notificationModal.show && notificationModal.type === 'success') {
      const timer = setTimeout(() => {
        setNotificationModal({ show: false, message: '', type: 'info' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationModal.show, notificationModal.type]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("darkMode");
      if (saved !== null) {
        setIsDarkMode(saved === "true");
      }
    }
  }, []);

  // Verifică dacă există date de notificare în localStorage pentru a deschide conversația
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUserId) return;
    
    const notificationDataStr = localStorage.getItem('notificationData');
    if (notificationDataStr) {
      try {
        const notificationData = JSON.parse(notificationDataStr);
        
        // Șterge datele din localStorage
        localStorage.removeItem('notificationData');
        
        // Dacă este pentru deschiderea unei conversații
        if (notificationData.openConversation || notificationData.openChat) {
          const { productId, bidId, chatId, sellerId, buyerId, messageId } = notificationData;
          
          if (productId) {
            // Pentru mesaje de chat
            if (notificationData.openChat && chatId) {
              setTimeout(async () => {
                // Obține informațiile despre chat pentru a determina sellerId-ul corect
                const { data: chat } = await supabase
                  .from('product_chats')
                  .select('seller_user_id, buyer_user_id, id')
                  .eq('id', chatId)
                  .maybeSingle();
                
                if (chat) {
                  // În my-bids, utilizatorul este cumpărător, deci sellerId este seller_user_id din chat
                  // Dacă utilizatorul este vânzător (seller_user_id === currentUserId), atunci sellerId este buyer_user_id
                  const actualSellerId = chat.seller_user_id === currentUserId 
                    ? chat.buyer_user_id  // Utilizatorul este vânzător, sellerId este buyerId
                    : chat.seller_user_id; // Utilizatorul este cumpărător, sellerId este sellerId
                  
                  setSelectedConversation({ 
                    productId, 
                    sellerId: actualSellerId 
                  });
                  
                  // Marchează mesajul specific ca citit dacă există messageId
                  if (messageId && chat.id) {
                    try {
                      await supabase
                        .from('product_chat_messages')
                        .update({ is_read: true })
                        .eq('id', messageId)
                        .eq('chat_id', chat.id)
                        .neq('sender_user_id', currentUserId);
                      
                      console.log('[my-bids] Marked message as read:', messageId);
                    } catch (error) {
                      console.error('[my-bids] Error marking message as read:', error);
                    }
                  }
                } else if (sellerId) {
                  // Fallback: folosim sellerId-ul din localStorage
                  setSelectedConversation({ 
                    productId, 
                    sellerId: sellerId 
                  });
                  
                  // Marchează mesajul specific ca citit dacă există messageId
                  if (messageId) {
                    try {
                      await supabase
                        .from('product_chat_messages')
                        .update({ is_read: true })
                        .eq('id', messageId)
                        .neq('sender_user_id', currentUserId);
                      
                      console.log('[my-bids] Marked message as read:', messageId);
                    } catch (error) {
                      console.error('[my-bids] Error marking message as read:', error);
                    }
                  }
                }
              }, 500);
            } else if (bidId) {
              // Pentru oferte/contraoferte, trebuie să găsim sellerId-ul din bid
              setTimeout(async () => {
                await loadBids();
                // După ce se încarcă bid-urile, găsim produsul și sellerId-ul
                const productBid = bids.find((b: Bid) => b.product?.id === productId && b.id === bidId);
                if (productBid && productBid.product?.user_id) {
                  // sellerId este user_id-ul produsului (vânzătorul)
                  setSelectedConversation({ 
                    productId, 
                    sellerId: productBid.product.user_id 
                  });
                } else {
                  // Fallback: găsește primul bid pentru acest produs
                  const anyBidForProduct = bids.find((b: Bid) => b.product?.id === productId);
                  if (anyBidForProduct && anyBidForProduct.product?.user_id) {
                    setSelectedConversation({ 
                      productId, 
                      sellerId: anyBidForProduct.product.user_id 
                    });
                  }
                }
              }, 500);
            } else if (sellerId) {
              // Fallback: folosim sellerId-ul direct
              setTimeout(() => {
                setSelectedConversation({ 
                  productId, 
                  sellerId: sellerId 
                });
              }, 500);
            }
          }
        }
      } catch (error) {
        console.error('[my-bids] Error parsing notification data:', error);
      }
    }
  }, [currentUserId, bids]);

  // Calculează timpul rămas până la expirarea contraofertei (12 ore)
  const getTimeRemaining = useCallback((createdAt: string): { hours: number; minutes: number; seconds: number; expired: boolean } => {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const expirationTime = created + (12 * 60 * 60 * 1000); // 12 ore în milisecunde
    const remaining = expirationTime - now;
    
    if (remaining <= 0) {
      return { hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds, expired: false };
  }, []);

  const loadBids = useCallback(async () => {
    let deferredSessionWait = false;
    try {
      // Loading doar la primul load - EVITĂ FLASH-UL DE LOADING
      if (firstLoadRef.current) {
      setLoading(true);
      }
      
      // Obține utilizatorul curent
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[loadBids] Error getting session:', sessionError);
        if (
          typeof window !== 'undefined' &&
          !hasDashboardLocalAuthEvidence()
        ) {
          window.location.href = '/auth';
        }
        return;
      }
      
      let userId: string | null = session?.user?.id ?? null;
      if (!userId && typeof window !== 'undefined') {
        const savedSid = localStorage.getItem('supabaseUserId');
        if (savedSid && looksLikeSupabaseUserId(savedSid)) {
          userId = savedSid;
        } else {
          const raw = localStorage.getItem('userInfo');
          if (raw) {
            try {
              const p = JSON.parse(raw) as Record<string, unknown>;
              userId =
                (looksLikeSupabaseUserId(p.supabaseUserId) ? String(p.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(p.userId) ? String(p.userId) : null) ||
                (looksLikeSupabaseUserId(p.id) ? String(p.id) : null);
            } catch {
              /* ignore */
            }
          }
        }
      }
      
      if (!userId) {
        if (hasDashboardLocalAuthEvidence()) {
          deferredSessionWait = true;
          return;
        }
        console.log('[loadBids] No user ID found, redirecting to auth');
        if (typeof window !== 'undefined') {
          window.location.href = '/auth';
        }
        return;
      }
      
      console.log('[loadBids] Loading bids for userId:', userId);
      // Actualizează currentUserId doar dacă s-a schimbat
      setCurrentUserId(prev => prev === userId ? prev : userId);

      // Obține toate ofertele utilizatorului
      const { data: userBidsData, error: userBidsError } = await supabase
        .from('bids')
        .select('id, amount, created_at, is_winning, is_outbid, product_id, user_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (userBidsError) {
        // Verifică dacă eroarea are proprietăți și nu este un obiect gol
        const hasErrorContent = userBidsError && typeof userBidsError === 'object' && Object.keys(userBidsError).length > 0;
        
        if (hasErrorContent) {
          const errorInfo = {
            message: userBidsError.message || 'No message',
            details: userBidsError.details || 'No details',
            hint: userBidsError.hint || 'No hint',
            code: userBidsError.code || 'No code',
            errorString: JSON.stringify(userBidsError),
            errorKeys: Object.keys(userBidsError || {}),
            userId: userId
          };
          console.error('[loadBids] Error loading user bids:', errorInfo);
        } else {
          // Dacă eroarea este goală sau null, nu logăm nimic (probabil nu este o eroare reală)
          console.log('[loadBids] userBidsError is empty or null, continuing...');
        }
        
        // Continuă chiar dacă există o eroare goală
        if (hasErrorContent) {
          setBids([]);
          return;
        }
      }

      if (!userBidsData || userBidsData.length === 0) {
        console.log('[loadBids] No user bids found for userId:', userId);
        setBids([]);
        return;
      }

      console.log('[loadBids] Found user bids:', userBidsData.length);

      // Obține toate produsele asociate cu ofertele
      const productIds = [...new Set(userBidsData.map((bid: any) => bid.product_id).filter(Boolean))];
      
      // Pentru fiecare produs, încarcă TOATE ofertele (inclusiv contraofertele vânzătorului și ofertele altor cumpărători)
      let allBidsData: any[] = [];
      
      if (productIds.length > 0) {
        const { data: allBids, error: allBidsError } = await supabase
          .from('bids')
          .select('id, amount, created_at, is_winning, is_outbid, product_id, user_id')
          .in('product_id', productIds)
          .order('created_at', { ascending: false });

        if (allBidsError) {
          console.error('[loadBids] Error loading all bids:', {
            error: allBidsError,
            message: allBidsError.message,
            details: allBidsError.details,
            hint: allBidsError.hint,
            code: allBidsError.code
          });
        } else if (allBids) {
          console.log('[loadBids] Found all bids:', allBids.length);
          allBidsData = allBids;
        } else {
          console.log('[loadBids] No all bids found');
        }
      }

      // Folosește TOATE ofertele pentru a afișa contextul complet (nu doar ofertele utilizatorului)
      // Astfel, în conversații vor apărea toate ofertele (atât ale utilizatorului, cât și ale vânzătorului/altor cumpărători)
      const bidsData = allBidsData.length > 0 ? allBidsData : userBidsData;

      // Obține toate produsele asociate cu ofertele
      const allProductIds: string[] = Array.from(
        new Set(
          bidsData
            .map((bid: { product_id?: string | null }) => bid.product_id)
            .filter(
              (id: string | null | undefined): id is string =>
                typeof id === "string" && id.length > 0,
            ),
        ),
      );
      
      let productsMap: Record<string, any> = {};
      
      if (allProductIds.length > 0) {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, title, slug, images, starting_price, currency, product_type, user_id')
          .in('id', allProductIds);

        if (productsError) {
          // Verifică dacă eroarea are proprietăți
          const errorInfo = productsError && typeof productsError === 'object'
            ? {
                message: productsError.message || 'No message',
                details: productsError.details || 'No details',
                hint: productsError.hint || 'No hint',
                code: productsError.code || 'No code',
                errorString: JSON.stringify(productsError),
                errorKeys: Object.keys(productsError || {}),
                productIds: allProductIds
              }
            : { error: productsError, productIds: allProductIds };
          
          console.error('[loadBids] Error loading products:', errorInfo);
        } else if (productsData) {
          console.log('[loadBids] Found products:', productsData.length);
          productsData.forEach((product: any) => {
            productsMap[product.id] = product;
          });

          // Obține profilele proprietarilor produselor
          const ownerIds: string[] = Array.from(
            new Set(
              productsData
                .map((p: { user_id?: string | null }) => p.user_id)
                .filter(
                  (id: string | null | undefined): id is string =>
                    typeof id === "string" && id.length > 0,
                ),
            ),
          );
          let ownersMap: Record<string, any> = {};
          let ownerRatingsMap: Record<string, { avgRating: number; reviewCount: number }> = {};

          if (ownerIds.length > 0) {
            // Încarcă profilele prin API pentru a bypass RLS
            try {
              const profilesResponse = await dashboardApiFetch('/api/admin/users/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: ownerIds }),
              });
              
              if (profilesResponse.ok) {
                const { profiles } = await profilesResponse.json();
                if (profiles && Array.isArray(profiles)) {
                  profiles.forEach((profile: any) => {
                    ownersMap[profile.user_id] = profile;
                  });
                }
              }
            } catch (apiError) {
              console.error('Error loading owner profiles via API:', apiError);
            }

            // Încarcă rating-urile pentru proprietari
            try {
              const ratingsPromises = ownerIds.map(async (ownerId: string) => {
                try {
                  const response = await dashboardApiFetch(`/api/reviews?userId=${ownerId}`);
                  if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.avgRating > 0) {
                      return {
                        userId: ownerId,
                        avgRating: result.avgRating,
                        reviewCount: result.reviewCount || 0
                      };
                    }
                  }
                  return null;
                } catch (error) {
                  return null;
                }
              });

              const ratingsResults = await Promise.all(ratingsPromises);
              ratingsResults.forEach((result) => {
                if (result) {
                  ownerRatingsMap[result.userId] = {
                    avgRating: result.avgRating,
                    reviewCount: result.reviewCount
                  };
                }
              });
            } catch (ratingsError) {
              console.warn('Error loading owner ratings:', ratingsError);
            }
          }

          // Adaugă informații despre proprietar la fiecare produs
          productsData.forEach((product: any) => {
            if (product.user_id && ownersMap[product.user_id]) {
              productsMap[product.id].owner = {
                userId: product.user_id,
                firstName: ownersMap[product.user_id].first_name,
                lastName: ownersMap[product.user_id].last_name,
                email: ownersMap[product.user_id].email,
                username: ownersMap[product.user_id].username,
                avatar_url: ownersMap[product.user_id].avatar_url
              };
              productsMap[product.id].ownerRating = ownerRatingsMap[product.user_id] || null;
            }
          });
        }
      }

      // Obține toate user_id-urile din oferte pentru a încărca profilele
      const allUserIds: string[] = Array.from(
        new Set(
          bidsData
            .map((bid: { user_id?: string | null }) => bid.user_id)
            .filter(
              (id: string | null | undefined): id is string =>
                typeof id === "string" && id.length > 0,
            ),
        ),
      );
      let profilesMap: Record<string, any> = {};
      let ratingsMap: Record<string, { avgRating: number; reviewCount: number }> = {};

      // Încarcă profilele utilizatorilor prin API
      if (allUserIds.length > 0) {
        try {
          const profilesResponse = await dashboardApiFetch('/api/admin/users/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: allUserIds }),
          });
          
          if (profilesResponse.ok) {
            const { profiles } = await profilesResponse.json();
            if (profiles && Array.isArray(profiles)) {
              profiles.forEach((profile: any) => {
                profilesMap[profile.user_id] = profile;
              });
            }
          }
        } catch (apiError) {
          console.error('Error loading user profiles via API:', apiError);
        }

        // Încarcă rating-urile pentru toți utilizatorii
        try {
          const ratingsPromises = allUserIds.map(async (userId: string) => {
            try {
              const response = await dashboardApiFetch(`/api/reviews?userId=${userId}`);
              if (response.ok) {
                const result = await response.json();
                if (result.success && result.avgRating > 0) {
                  return {
                    userId,
                    avgRating: result.avgRating,
                    reviewCount: result.reviewCount || 0
                  };
                }
              }
              return null;
            } catch (error) {
              return null;
            }
          });

          const ratingsResults = await Promise.all(ratingsPromises);
          ratingsResults.forEach((result) => {
            if (result) {
              ratingsMap[result.userId] = {
                avgRating: result.avgRating,
                reviewCount: result.reviewCount
              };
            }
          });
        } catch (ratingsError) {
          console.warn('Error loading ratings:', ratingsError);
        }
      }

      // Verifică dacă există oferte acceptate și setează starea
      // FIX: Folosim created_at din bid în loc de Date.now() pentru a evita update-uri false
      const winningBidsMap: Record<string, { bidId: string; acceptedAt: number }> = {};
      bidsData.forEach((bid: any) => {
        if (bid.is_winning === true && bid.product_id) {
          if (!winningBidsMap[bid.product_id]) {
            winningBidsMap[bid.product_id] = { 
              bidId: bid.id, 
              acceptedAt: new Date(bid.created_at).getTime() // FIX: folosim created_at, nu Date.now()
            };
          }
        }
      });
      
      // Actualizează starea pentru ofertele acceptate (doar dacă există schimbări reale)
      setAcceptedBids(prev => {
        // Compară rapid folosind chei
        const prevKey = Object.keys(prev).sort().map(k => `${k}:${prev[k].bidId}`).join('|');
        const newKey = Object.keys(winningBidsMap).sort().map(k => `${k}:${winningBidsMap[k].bidId}`).join('|');
        
        // Dacă cheile sunt identice, nu există schimbări - returnează state-ul vechi
        if (prevKey === newKey) {
          return prev; // EVITĂ RE-RENDER-URI INUTILE
        }
        
        // Dacă există diferențe, actualizează
        return winningBidsMap;
      });

      // Transformă datele pentru a avea o structură mai ușor de folosit
      const transformedBids = bidsData.map((bid: any) => {
        const product = productsMap[bid.product_id];
        const profile = bid.user_id ? profilesMap[bid.user_id] : null;
        const rating = bid.user_id ? ratingsMap[bid.user_id] : null;
        
        // Extrage prima imagine din array-ul images
        const images = product?.images || [];
        const firstImage = Array.isArray(images) && images.length > 0 
          ? (typeof images[0] === 'string' ? images[0] : images[0]?.url || images[0])
          : null;
        
        return {
          id: bid.id,
          amount: bid.amount,
          created_at: bid.created_at,
          is_winning: bid.is_winning || false,
          is_outbid: bid.is_outbid || false,
          product_id: bid.product_id,
          user_id: bid.user_id,
          user_profiles: profile || null,
          user_rating: rating || null,
          product: product ? {
            id: product.id,
            title: product.title || 'Fără titlu',
            slug: product.slug,
            image: firstImage || '/no-image-placeholder.svg',
            startingPrice: product.starting_price || 0,
            currency: product.currency || 'RON',
            product_type: product.product_type || 'live-bid',
            user_id: product.user_id,
            owner: product.owner,
            ownerRating: (product as any).ownerRating || null
          } : undefined
        };
      });

      // Actualizează doar dacă există diferențe reale - folosim comparare rapidă cu chei
      setBids(prevBids => {
        // Dacă numărul de oferte s-a schimbat, actualizează
        if (prevBids.length !== transformedBids.length) {
          return transformedBids;
        }
        
        // Dacă nu există oferte, nu actualiza
        if (prevBids.length === 0 && transformedBids.length === 0) {
          return prevBids;
        }
        
        // Compară rapid folosind chei simple pentru câmpurile esențiale
        // IMPORTANT: Comparăm doar câmpurile care afectează UI-ul
        const prevBidsKey = prevBids
          .map((b: Bid) => `${b.id}:${b.is_winning}:${b.amount}:${b.is_outbid}:${b.product_id}`)
          .sort()
          .join('|');
        const newBidsKey = transformedBids
          .map((b: Bid) => `${b.id}:${b.is_winning}:${b.amount}:${b.is_outbid}:${b.product_id}`)
          .sort()
          .join('|');
        
        // Dacă cheile sunt identice, nu există schimbări esențiale - returnează state-ul vechi
        // ACESTA ESTE CRUCIAL PENTRU A EVITA RE-RENDER-URI INUTILE
        if (prevBidsKey === newBidsKey) {
          return prevBids; // EVITĂ RE-RENDER-URI INUTILE
        }
        
        // Dacă există diferențe, actualizează
        return transformedBids;
      });
    } catch (error: any) {
      console.error('[loadBids] Error in loadBids catch block:', {
        error,
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        toString: error?.toString()
      });
      setBids([]);
    } finally {
      // Loading doar la primul load - EVITĂ FLASH-UL DE LOADING
      if (firstLoadRef.current && !deferredSessionWait) {
      setLoading(false);
        firstLoadRef.current = false;
    }
    }
  }, []); // Eliminăm router din dependențe pentru a evita re-crearea funcției

  // Supabase Realtime pentru actualizări live - ELIMINĂ POLLING-UL COMPLET
  useEffect(() => {
    let alive = true;

    // Debounce ca să nu chemi loadBids de 10 ori la un burst de update-uri
    const debounceMs = 400;
    const debounceRef = { t: null as ReturnType<typeof setTimeout> | null };

    const scheduleReload = () => {
      if (!alive) return;
      if (debounceRef.t) clearTimeout(debounceRef.t);
      debounceRef.t = setTimeout(() => {
        if (!alive) return;
        loadBids().catch((e) => console.error("[realtime] loadBids error:", e));
      }, debounceMs);
    };

    // 1) Load inițial + retry (sesiunea poate întârzia în WebView)
    loadBids().catch((e) => console.error("[init] loadBids error:", e));
    const retryBidsTimer = setTimeout(() => {
      loadBids().catch((e) => console.error("[init-retry] loadBids error:", e));
    }, 1200);

    // 2) Subscribe realtime pe tabela bids
    // Opțiunea A (simplă, recomandată): ascultă toate schimbările pe bids și debounced loadBids()
    // Asta permite să primești notificări și pentru contraoferte (când vânzătorul pune bid)
    const channel = supabase
      .channel("realtime:bids:my-bids")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "bids",
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (!alive) return;

          // Reîncarcă pentru orice schimbare (inclusiv contraoferte de la vânzători)
          // Debounce-ul previne spam-ul la burst-uri de update-uri
          scheduleReload();
        }
      )
      .subscribe((_status: string) => {
        // Util la debug (opțional):
        // console.log("[realtime] subscription status:", status);
      });

    return () => {
      alive = false;
      clearTimeout(retryBidsTimer);
      if (debounceRef.t) clearTimeout(debounceRef.t);
      supabase.removeChannel(channel);
    };
  }, [loadBids]); // loadBids este stabil (useCallback cu [])

  // Încarcă mesajele necitite pentru toate conversațiile
  useEffect(() => {
    const loadUnreadMessages = async () => {
      if (!currentUserId) return;

      try {
        // Găsește TOATE chat-urile unde utilizatorul este cumpărătorul (inclusiv cele fără bid-uri)
        const { data: chats } = await supabase
          .from('product_chats')
          .select('id, product_id, buyer_user_id, seller_user_id')
          .eq('buyer_user_id', currentUserId);

        if (!chats || chats.length === 0) {
          setUnreadMessages({});
          return;
        }

        // Încarcă mesajele necitite pentru fiecare chat
        const chatIds = chats.map((chat: { id: string }) => chat.id);
        const { data: unreadMessagesData } = await supabase
          .from('product_chat_messages')
          .select('chat_id, sender_user_id')
          .in('chat_id', chatIds)
          .eq('is_read', false)
          .neq('sender_user_id', currentUserId);

        if (!unreadMessagesData) {
          setUnreadMessages({});
          return;
        }

        // Numără mesajele necitite pentru fiecare conversație (productId + sellerId)
        const unreadCounts: Record<string, number> = {};
        type ChatRow = { id: string; product_id: string; seller_user_id: string };
        unreadMessagesData.forEach((msg: { chat_id: string; sender_user_id?: string }) => {
          // Găsește conversația corespunzătoare acestui chat_id
          const chat = chats.find((c: ChatRow) => c.id === msg.chat_id);
          if (chat) {
            const conversationKey = `${chat.product_id}-${chat.seller_user_id}`;
            unreadCounts[conversationKey] = (unreadCounts[conversationKey] || 0) + 1;
          }
        });

        setUnreadMessages(unreadCounts);
      } catch (error) {
        console.error('[loadUnreadMessages] Error loading unread messages:', error);
      }
    };

    loadUnreadMessages();
    
    // Reîncarcă mesajele necitite la fiecare 5 secunde
    const interval = setInterval(loadUnreadMessages, 5000);
    
    return () => clearInterval(interval);
  }, [currentUserId, bids]);

  // Creează un array stabil pentru dependency array (mark messages as read)
  const markReadDeps = useMemo(() => {
    return [
      selectedConversation?.productId ?? null,
      selectedConversation?.sellerId ?? null,
      currentUserId ?? null
    ] as const;
  }, [selectedConversation?.productId, selectedConversation?.sellerId, currentUserId]);

  // Marchează mesajele ca citite când se deschide conversația
  useEffect(() => {
    const [productId, sellerId, userId] = markReadDeps;
    
    if (!productId || !sellerId || !userId) return;

    const markMessagesAsRead = async () => {
      const conversationKey = `${productId}-${sellerId}`;

      try {
        // Găsește chat-ul pentru această conversație unde utilizatorul este cumpărătorul
        const { data: chat } = await supabase
          .from('product_chats')
          .select('id')
          .eq('product_id', productId)
          .eq('buyer_user_id', userId)
          .eq('seller_user_id', sellerId)
          .maybeSingle();

        if (!chat) return;

        // Verifică dacă există mesaje necitite înainte de a marca
        const { data: unreadData } = await supabase
          .from('product_chat_messages')
          .select('id')
          .eq('chat_id', chat.id)
          .eq('is_read', false)
          .neq('sender_user_id', userId)
          .limit(1);

        if (!unreadData || unreadData.length === 0) return;

        // Marchează toate mesajele necitite ca citite
        await supabase
          .from('product_chat_messages')
          .update({ is_read: true })
          .eq('chat_id', chat.id)
          .eq('is_read', false)
          .neq('sender_user_id', userId);

        // Elimină conversația din lista de mesaje necitite
        setUnreadMessages(prev => {
          const newState = { ...prev };
          delete newState[conversationKey];
          return newState;
        });
      } catch (error) {
        console.error('[markMessagesAsRead] Error marking messages as read:', error);
      }
    };

    markMessagesAsRead();
  }, markReadDeps);

  // Detectează contraofertele vânzătorului și adaugă mesaje prietenoase
  useEffect(() => {
    if (!currentUserId || bids.length === 0) return;

    // Pentru fiecare produs, verifică dacă există contraoferte noi de la vânzător
    const productIds = [...new Set(bids.map(bid => bid.product_id).filter(Boolean))];
    
    productIds.forEach(productId => {
      const productBids = bids.filter(bid => bid.product_id === productId);
      const product = productBids[0]?.product;
      if (!product) return;

      // Găsește contraofertele vânzătorului (oferte unde user_id === product.user_id)
      const sellerCounterOffers = productBids.filter(bid => 
        bid.user_id === product.user_id && 
        bid.user_id !== currentUserId
      );

      if (sellerCounterOffers.length > 0) {
        // Sortează după data creării
        const sortedOffers = sellerCounterOffers.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        // Verifică fiecare contraofertă
        sortedOffers.forEach(offer => {
          const offerKey = `seller-offer-${offer.id}`;
          
          // Verifică dacă am procesat deja această ofertă
          if (processedOffersRef.current.has(offerKey)) return;
          
          // Marchează oferta ca procesată
          processedOffersRef.current.add(offerKey);
          
          const sellerName = product.owner?.username || 
            `${product.owner?.firstName || ''} ${product.owner?.lastName || ''}`.trim() || 
            product.owner?.email || 
            'Vânzătorul';
          
          const offerTime = new Date(offer.created_at).getTime();
          const messageId = `seller-counter-offer-${offer.id}`;
          
          setChatSystemMessages(prev => {
            const existing = prev[productId] || [];
            // Verifică dacă există deja un mesaj similar
            const hasSimilar = existing.some(m => 
              m.id === messageId || (
                m.message.includes('vânzătorul') && 
                Math.abs(m.timestamp - offerTime) < 5000
              )
            );
            if (hasSimilar) return prev;
            
            return {
              ...prev,
              [productId]: [
                ...existing,
                {
                  id: messageId,
                  message: `${sellerName} dorește să vă facă o contraofertă`,
                  timestamp: offerTime
                }
              ]
            };
          });
        });
      }
    });
  }, [bids, currentUserId]);

  // Nu mai folosim timer pentru countdown - ofertele se actualizează automat prin polling

  const formatPrice = (price: number, currency: string = 'RON') => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Funcție pentru acceptarea unei oferte (cumpărător acceptă contraoferta vânzătorului)
  const handleAcceptBid = useCallback(async (productId: string, bidId: string, bidAmount: number) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setNotificationModal({
          show: true,
          message: 'Trebuie să fii autentificat pentru a accepta oferte.',
          type: 'error',
        });
        return;
      }

      const response = await dashboardApiFetch('/api/bids/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          bid_id: bidId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setNotificationModal({
          show: true,
          message: result.error || 'Eroare la acceptarea ofertei',
          type: 'error',
        });
        return;
      }

      // Setează oferta acceptată
      setAcceptedBids(prev => ({
        ...prev,
        [productId]: { bidId, acceptedAt: Date.now() }
      }));

      // Elimină expirarea contraofertei (a fost acceptată)
      setCounterOfferExpirations(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });

      // Reîncarcă ofertele folosind loadBids în loc de reload
      await loadBids();
      
      setNotificationModal({
        show: true,
        message: 'Oferta a fost acceptată cu succes!',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error accepting bid:', error);
      setNotificationModal({
        show: true,
        message: 'Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'),
        type: 'error',
      });
    }
  }, []); // Eliminăm loadBids din dependențe

  const getProductUrl = (product: Bid['product']) => {
    if (!product) return '#';
    
    const productTypeRoutes: Record<string, string> = {
      'licitatii-publice': 'licitatii-publice',
      'live-bid': 'live_bid',
      'buy-now': 'produs',
    };
    
    const route = productTypeRoutes[product.product_type] || 'produs';
    return `/${route}/${product.slug}`;
  };

  // Funcție pentru a grupa ofertele după produs și vânzător (EXACT ca în my-products, dar inversat)
  // În my-products: grupează după buyerId (cumpărător), ignoră ofertele vânzătorului
  // În my-bids: grupează după sellerId (vânzător/proprietarul produsului), include TOATE ofertele (cumpărător + vânzător)
  const getConversationsByProduct = useCallback((productId: string) => {
    const productBids = bids.filter(bid => bid.product?.id === productId);
    // Grupează ofertele după seller_id (vânzător) - pentru fiecare produs, vânzătorul este proprietarul produsului
    // Include TOATE ofertele (atât ale cumpărătorului, cât și ale vânzătorului) pentru a afișa conversația completă
    const bidsBySeller = productBids.reduce((acc, bid) => {
      if (!bid.product) return acc;
      const sellerId = bid.product.user_id || '';
      if (!sellerId) return acc;
      if (!acc[sellerId]) {
        acc[sellerId] = {
          sellerId,
          sellerInfo: bid.product.owner || null,
          bids: []
        };
      }
      // Include TOATE ofertele (atât ale cumpărătorului, cât și ale vânzătorului)
      acc[sellerId].bids.push(bid);
      return acc;
    }, {} as Record<string, { sellerId: string; sellerInfo: any; bids: Bid[] }>);
    
    return Object.values(bidsBySeller).map(conv => ({
      ...conv,
      latestBid: conv.bids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0],
      highestBid: Math.max(...conv.bids.map(b => b.amount || 0))
    }));
  }, [bids]);

  // Funcții pentru mesaje normale (chat)
  const loadChatMessages = useCallback(async (productId: string, sellerId: string) => {
    console.log('[DEBUG loadChatMessages] START - Called with:', { productId, sellerId, currentUserId, currentChatId: chatId });
    
    if (!currentUserId) {
      console.log('[DEBUG loadChatMessages] STOP - No currentUserId');
      return;
    }
    
    try {
      // Obține sau creează chat-ul
      const params = new URLSearchParams({
        productId: productId,
        buyerId: currentUserId,
      });
      
      console.log('[DEBUG loadChatMessages] Request params:', { productId, buyerId: currentUserId, sellerId, params: params.toString() });
      
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.log('[DEBUG loadChatMessages] STOP - No session');
        return;
      }
      
      console.log('[DEBUG loadChatMessages] Fetching from API...');
      const response = await dashboardApiFetch(`/api/product-chat/messages?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      console.log('[DEBUG loadChatMessages] API response status:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG loadChatMessages] API response data:', {
          chatId: data.chat?.id,
          messagesCount: data.messages?.length || 0,
          chatBuyerId: data.chat?.buyer_user_id,
          chatSellerId: data.chat?.seller_user_id,
          messageIds: data.messages?.map((m: any) => ({ id: m.id, sender: m.sender_user_id, text: m.message_text?.substring(0, 50) })),
          fullData: data
        });
        
        // Actualizează chatId dacă a fost creat unul nou sau dacă s-a schimbat
        if (data.chat?.id) {
          const newChatId = data.chat.id;
          console.log('[DEBUG loadChatMessages] Chat ID check:', { oldChatId: chatId, newChatId, areEqual: newChatId === chatId });
          if (newChatId !== chatId) {
            console.log('[DEBUG loadChatMessages] Chat ID changed:', chatId, '->', newChatId);
            setChatId(newChatId);
          }
        }
        
        console.log('[DEBUG loadChatMessages] Setting messages state. Current messages count:', chatMessages.length, 'New messages count:', data.messages?.length || 0);
        setChatMessages(data.messages || []);
        console.log('[DEBUG loadChatMessages] Messages state updated');
      } else {
        const errorData = await response.json();
        console.error('[DEBUG loadChatMessages] API ERROR:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
      }
    } catch (error) {
      console.error('[DEBUG loadChatMessages] EXCEPTION:', error);
    }
  }, [currentUserId, chatId]);
  
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setSelectedImages([...selectedImages, ...fileArray]);

    // Create previews
    const previewPromises = fileArray.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    const previews = await Promise.all(previewPromises);
    setImagePreviews([...imagePreviews, ...previews]);

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
    setImagePreviews(imagePreviews.filter((_, i) => i !== index));
  };

  const uploadImages = async (): Promise<string[]> => {
    if (selectedImages.length === 0) return [];

    setIsUploadingImages(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of selectedImages) {
        const result = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });

        if (result.success && result.url) {
          uploadedUrls.push(result.url);
        } else {
          throw new Error((!result.success && result.error) || 'Eroare la încărcarea imaginii');
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    } finally {
      setIsUploadingImages(false);
    }

    return uploadedUrls;
  };

  const insertEmoji = (emoji: string) => {
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const sendMessage = useCallback(async () => {
    console.log('[DEBUG sendMessage] START - Called', {
      hasSelectedConversation: !!selectedConversation,
      messageInput: messageInput.trim(),
      hasImages: selectedImages.length > 0,
      isSendingMessage,
      currentChatId: chatId,
      currentUserId,
      currentMessagesCount: chatMessages.length
    });
    
    if (!selectedConversation || (!messageInput.trim() && selectedImages.length === 0) || isSendingMessage) {
      console.log('[DEBUG sendMessage] STOP - Invalid conditions');
      return;
    }

    setIsSendingMessage(true);
    try {
      // Upload images first
      let attachmentUrls: string[] = [];
      if (selectedImages.length > 0) {
        try {
          attachmentUrls = await uploadImages();
          console.log('[DEBUG sendMessage] Images uploaded:', attachmentUrls);
        } catch (error) {
          console.error('[DEBUG sendMessage] Image upload error:', error);
          setNotificationModal({
            show: true,
            message: 'Eroare la încărcarea imaginilor. Te rog încearcă din nou.',
            type: 'error',
          });
          setIsSendingMessage(false);
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.log('[DEBUG sendMessage] STOP - No session');
        return;
      }

      const requestBody = {
        chatId: chatId,
        productId: selectedConversation.productId,
        buyerId: currentUserId,
        messageText: messageInput.trim(),
      };
      
      console.log('[DEBUG sendMessage] Sending POST request:', {
        url: '/api/product-chat/messages',
        body: requestBody,
        currentChatId: chatId,
        currentUserId
      });

      const response = await dashboardApiFetch('/api/product-chat/messages', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[DEBUG sendMessage] API response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG sendMessage] API response data:', {
          hasMessage: !!data.message,
          messageId: data.message?.id,
          messageText: data.message?.message_text,
          messageSenderId: data.message?.sender_user_id,
          chatId: data.chat?.id,
          chatBuyerId: data.chat?.buyer_user_id,
          chatSellerId: data.chat?.seller_user_id,
          fullResponse: data
        });
        
        // Actualizează chatId dacă a fost creat unul nou
        if (data.chat && data.chat.id && data.chat.id !== chatId) {
          console.log('[DEBUG sendMessage] Chat ID changed:', chatId, '->', data.chat.id);
          setChatId(data.chat.id);
        }
        
        setMessageInput('');
        setSelectedImages([]);
        setImagePreviews([]);
        
        // Adaugă mesajul instant în UI (optimistic update)
        if (data.message) {
          console.log('[DEBUG sendMessage] Adding message to UI state. Current messages:', chatMessages.length);
          
          setChatMessages((prev) => {
            console.log('[DEBUG sendMessage] setChatMessages callback - prev count:', prev.length, 'message ID:', data.message.id);
            // Evită duplicatele
            if (prev.some((m) => m.id === data.message.id)) {
              console.log('[DEBUG sendMessage] Message already exists in state, skipping:', data.message.id);
              return prev;
            }
            const newMessages = [...prev, data.message];
            console.log('[DEBUG sendMessage] Message added to state. New count:', newMessages.length);
            return newMessages;
          });
        } else {
          console.error('[DEBUG sendMessage] ERROR - No message in API response!', data);
        }
        
        // Reîncarcă mesajele după un scurt delay
        setTimeout(async () => {
          console.log('[DEBUG sendMessage] Reloading messages after 1 second delay');
          await loadChatMessages(selectedConversation.productId, selectedConversation.sellerId);
        }, 1000);
        
        // Scroll la final după mesaj trimis
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      } else {
        const errorData = await response.json();
        console.error('[DEBUG sendMessage] API ERROR:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        setNotificationModal({
          show: true,
          message: errorData.error || 'Eroare la trimiterea mesajului',
          type: 'error',
        });
      }
    } catch (error: any) {
      console.error('[DEBUG sendMessage] EXCEPTION:', error);
      setNotificationModal({
        show: true,
        message: 'Eroare la trimiterea mesajului: ' + (error.message || 'Eroare necunoscută'),
        type: 'error',
      });
    } finally {
      setIsSendingMessage(false);
      console.log('[DEBUG sendMessage] END - Finished');
    }
  }, [selectedConversation, messageInput, selectedImages, chatId, currentUserId, isSendingMessage, loadChatMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Creează un array stabil pentru dependency array (load messages)
  const loadMessagesDeps = useMemo(() => {
    return [
      selectedConversation?.productId ?? null,
      selectedConversation?.sellerId ?? null,
      currentUserId ?? null
    ] as const;
  }, [selectedConversation?.productId, selectedConversation?.sellerId, currentUserId]);

  // Load chat messages when conversation is selected
  useEffect(() => {
    const [productId, sellerId, userId] = loadMessagesDeps;
    
    if (productId && sellerId && userId) {
      loadChatMessages(productId, sellerId);
    } else {
      setChatMessages([]);
      setChatId(null);
    }
  }, [loadMessagesDeps, loadChatMessages]);

  // Supabase Realtime pentru mesaje live - același mecanism ca în ProductChat
  useEffect(() => {
    console.log('[DEBUG Realtime] useEffect triggered', { chatId, currentUserId, currentMessagesCount: chatMessages.length });
    
    if (!chatId || !currentUserId) {
      console.log('[DEBUG Realtime] STOP - Missing chatId or currentUserId', { chatId, currentUserId });
      return;
    }

    console.log('[DEBUG Realtime] Setting up subscription for chat:', chatId, 'channel:', `product-chat:${chatId}`);

    const channel = supabase
      .channel(`product-chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[DEBUG Realtime] EVENT RECEIVED:', {
            eventType: payload.eventType,
            chatId: chatId,
            hasNew: !!payload.new,
            hasOld: !!payload.old,
            newMessageId: (payload.new as any)?.id,
            newMessageText: (payload.new as any)?.message_text,
            newMessageSender: (payload.new as any)?.sender_user_id,
            currentUserId,
            currentMessagesCount: chatMessages.length
          });
          
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as any;
            console.log('[DEBUG Realtime] INSERT - New message details:', {
              messageId: newMessage.id,
              messageText: newMessage.message_text,
              senderId: newMessage.sender_user_id,
              chatId: newMessage.chat_id,
              createdAt: newMessage.created_at,
              isSystem: newMessage.is_system_message,
              currentUserId
            });
            
            setChatMessages((prev) => {
              console.log('[DEBUG Realtime] setChatMessages callback - prev messages:', prev.length, 'prev IDs:', prev.map(m => m.id));
              console.log('[DEBUG Realtime] New message ID:', newMessage.id, 'exists in prev?', prev.some((m) => m.id === newMessage.id));
              
              // Evită duplicatele
              if (prev.some((m) => m.id === newMessage.id)) {
                console.log('[DEBUG Realtime] SKIP - Message already exists in state:', newMessage.id);
                return prev;
              }
              
              const newMessages = [...prev, newMessage];
              console.log('[DEBUG Realtime] ADDED - Message added to state. New count:', newMessages.length, 'new IDs:', newMessages.map(m => m.id));
              return newMessages;
            });
            
            // Scroll la final după mesaj nou
            setTimeout(() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 100);
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as any;
            console.log('[DEBUG Realtime] UPDATE - Message updated:', {
              messageId: updatedMessage.id,
              updates: updatedMessage,
              currentMessagesCount: chatMessages.length
            });
            
            setChatMessages((prev) =>
              prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedMessage = payload.old as any;
            console.log('[DEBUG Realtime] DELETE - Message deleted:', {
              messageId: deletedMessage.id,
              currentMessagesCount: chatMessages.length
            });
            setChatMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[DEBUG Realtime] Subscription status changed:', {
          status,
          chatId,
          channel: `product-chat:${chatId}`
        });
        if (status === 'SUBSCRIBED') {
          console.log('[DEBUG Realtime] ✅ SUBSCRIBED to chat:', chatId);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[DEBUG Realtime] CHANNEL_ERROR for chat (non-fatal):', chatId);
        } else if (status === 'TIMED_OUT') {
          console.warn('[DEBUG Realtime] TIMED_OUT for chat (non-fatal):', chatId);
        } else if (status === 'CLOSED') {
          console.log('[DEBUG Realtime] ⚠️ CLOSED for chat:', chatId);
        }
      });

    return () => {
      console.log('[DEBUG Realtime] CLEANUP - Removing subscription for chat:', chatId);
      supabase.removeChannel(channel);
    };
  }, [chatId, currentUserId]);

  // Grupează ofertele după produs (pentru a afișa lista de produse)
  const bidsByProduct = bids.reduce((acc, bid) => {
    if (!bid.product) return acc;
    
    const productId = bid.product.id;
    if (!acc[productId]) {
      acc[productId] = {
        product: bid.product,
        bids: []
      };
    }
    acc[productId].bids.push(bid);
    return acc;
  }, {} as Record<string, { product: Bid['product']; bids: Bid[] }>);

  const groupedBids = Object.values(bidsByProduct);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />
      
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-2 sm:py-4 lg:py-6">
        <div className="mb-2 sm:mb-4 lg:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex-1">
            <h1 className={`text-base sm:text-xl lg:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Ofertele mele
            </h1>
            <p className={`mt-0.5 sm:mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Toate ofertele pe care le-ai plasat
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-colors text-xs ${
              isDarkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            }`}
          >
            <i className="ri-arrow-left-line mr-1"></i>
            <span>Înapoi</span>
          </button>
        </div>

        {loading ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto ${
              isDarkMode ? 'border-blue-400' : 'border-blue-600'
            }`}></div>
            <p className="mt-4">Se încarcă ofertele...</p>
          </div>
        ) : groupedBids.length === 0 ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <i className="ri-inbox-line text-6xl mb-4"></i>
            <p className="text-lg font-medium mb-2">Nu ai plasat încă nicio ofertă</p>
            <p className="text-sm">Începe să licitezi pentru produsele care te interesează!</p>
            <button
              onClick={() => router.push('/ro')}
              className={`mt-6 px-6 py-3 rounded-lg font-semibold transition-colors ${
                isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <i className="ri-search-line mr-2"></i>
              Caută licitații
            </button>
          </div>
        ) : (
          <div className="flex h-[600px] rounded-lg border border-gray-200 overflow-hidden bg-white">
            {/* Left Panel - Lista de conversații - stil Vinted */}
            <div className="w-full md:w-1/3 border-r border-gray-200 bg-white flex flex-col">
              {/* Header lista */}
              <div className="p-4 border-b border-gray-200 bg-white">
                <h2 className="text-base font-semibold text-gray-900">
                  Conversații
                </h2>
              </div>
              
              {/* Lista conversații */}
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  // Colectează TOATE conversațiile pentru TOATE produsele într-o singură listă
                  // EXACT ca în my-products, dar pentru toate produsele într-o singură listă
                  const allConversations: Array<{ product: Bid['product']; sellerId: string; sellerInfo: any; bids: Bid[]; latestBid?: Bid }> = [];
                  
                  console.log('[DEBUG my-bids] groupedBids count:', groupedBids.length);
                  console.log('[DEBUG my-bids] bids total:', bids.length);
                  
                  // Pentru fiecare produs la care utilizatorul a făcut oferte
                  groupedBids.forEach(({ product, bids: productBids }) => {
                    if (!product) {
                      console.log('[DEBUG my-bids] Skipping - no product');
                      return;
                    }
                    
                    console.log('[DEBUG my-bids] Processing product:', product.id, product.title, 'owner:', product.owner);
                    
                    // Folosește getConversationsByProduct pentru a grupa corect după vânzător
                    // Această funcție returnează conversațiile pentru acest produs (grupate după vânzător)
                    const conversations = getConversationsByProduct(product.id);
                    console.log('[DEBUG my-bids] Conversations for product', product.id, ':', conversations.length);
                    
                    // Pentru fiecare conversație (vânzător) pentru acest produs
                    conversations.forEach((conv) => {
                      console.log('[DEBUG my-bids] Conversation:', {
                        productId: product.id,
                        sellerId: conv.sellerId,
                        hasSellerInfo: !!conv.sellerInfo,
                        sellerInfo: conv.sellerInfo,
                        bidsCount: conv.bids.length
                      });
                      
                      // Verifică dacă există deja o conversație pentru același produs și vânzător
                      const exists = allConversations.some(
                        c => c.product?.id === product.id && c.sellerId === conv.sellerId
                      );
                      
                      if (!exists) {
                        // Dacă nu există sellerInfo, încearcă să-l obțină din product.owner
                        const sellerInfo = conv.sellerInfo || product.owner || null;
                        
                        if (sellerInfo) {
                          console.log('[DEBUG my-bids] Adding conversation:', {
                            productId: product.id,
                            productTitle: product.title,
                            sellerId: conv.sellerId,
                            sellerInfo: sellerInfo
                          });
                          
                          allConversations.push({
                            product,
                            sellerId: conv.sellerId,
                            sellerInfo: sellerInfo,
                            bids: conv.bids,
                            latestBid: conv.latestBid
                          });
                        } else {
                          console.warn('[DEBUG my-bids] Skipping conversation - no sellerInfo:', {
                            productId: product.id,
                            sellerId: conv.sellerId,
                            productOwner: product.owner
                          });
                        }
                      } else {
                        console.log('[DEBUG my-bids] Skipping - conversation already exists');
                      }
                    });
                  });
                  
                  console.log('[DEBUG my-bids] Total conversations collected:', allConversations.length);
                  
                  // Adaugă și conversațiile care au mesaje dar nu au bid-uri
                  chatsWithoutBids.forEach((conv) => {
                    const exists = allConversations.some(
                      c => c.product?.id === conv.product?.id && c.sellerId === conv.sellerId
                    );
                    if (!exists) {
                      allConversations.push(conv);
                    }
                  });
                  
                  // Sortează conversațiile după ultimul mesaj/ofertă (cel mai recent)
                  allConversations.sort((a, b) => {
                    const aLatest = a.latestBid || (a.bids.length > 0 
                      ? a.bids.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0]
                      : null);
                    const bLatest = b.latestBid || (b.bids.length > 0
                      ? b.bids.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0]
                      : null);
                    if (!aLatest && !bLatest) return 0;
                    if (!aLatest) return 1;
                    if (!bLatest) return -1;
                    return new Date(bLatest.created_at).getTime() - new Date(aLatest.created_at).getTime();
                  });
                  
                  if (allConversations.length === 0) {
                    return (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        Nu există oferte încă
                      </div>
                    );
                  }
                  
                  return allConversations.map((conv) => {
                    const latestBid = conv.latestBid || (conv.bids.length > 0 
                      ? conv.bids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                      : null);
                    const isSelected = selectedConversation?.productId === conv.product?.id && selectedConversation?.sellerId === conv.sellerId;
                    
                    // Verifică dacă există mesaje necitite pentru această conversație
                    const conversationKey = `${conv.product?.id}-${conv.sellerId}`;
                    const unreadCount = unreadMessages[conversationKey] || 0;
                    const hasUnreadMessages = unreadCount > 0;
                    
                    // Extrage numele vânzătorului din owner object
                    const owner = conv.sellerInfo;
                    const sellerName = owner?.username || 
                      (owner?.firstName && owner?.lastName ? `${owner.firstName} ${owner.lastName}` : '') ||
                      (owner?.first_name && owner?.last_name ? `${owner.first_name} ${owner.last_name}` : '') ||
                      owner?.email || 
                      'Vânzător';
                    
                    return (
                      <button
                        key={conversationKey}
                        onClick={() => {
                          if (conv.product) {
                            setSelectedConversation({ productId: conv.product.id, sellerId: conv.sellerId });
                            // Resetează numărul de mesaje necitite când se selectează conversația
                            if (hasUnreadMessages) {
                              setUnreadMessages(prev => {
                                const newState = { ...prev };
                                delete newState[conversationKey];
                                return newState;
                              });
                            }
                          }
                        }}
                        className={`w-full p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left relative ${
                          isSelected ? 'bg-blue-50' : ''
                        } ${
                          hasUnreadMessages ? 'bg-blue-50/50 border-l-4 border-l-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar vânzător */}
                          <div className="flex-shrink-0 relative">
                            {(() => {
                              const owner = conv.sellerInfo;
                              const avatarUrl = owner?.avatar_url;
                              const firstLetter = owner?.firstName?.[0] || owner?.first_name?.[0] || owner?.username?.[0] || 'V';
                              
                              return avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={sellerName}
                                  className={`w-12 h-12 rounded-full object-cover ${
                                    hasUnreadMessages ? 'ring-2 ring-blue-500' : ''
                                  }`}
                                />
                              ) : (
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold ${
                                  hasUnreadMessages 
                                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' 
                                    : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {firstLetter.toUpperCase()}
                                </div>
                              );
                            })()}
                            {hasUnreadMessages && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                              </div>
                            )}
                          </div>
                          
                          {/* Info conversație */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${
                                  hasUnreadMessages ? 'font-semibold text-gray-900' : 'text-gray-900'
                                }`}>
                                  {sellerName}
                                </p>
                                {hasUnreadMessages && (
                                  <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                  </span>
                                )}
                              </div>
                              {latestBid && (
                                <span className="text-xs flex-shrink-0 text-gray-500">
                                  {(() => {
                                    const date = new Date(latestBid.created_at);
                                    const now = new Date();
                                    const diffMs = now.getTime() - date.getTime();
                                    const diffMins = Math.floor(diffMs / 60000);
                                    const diffHours = Math.floor(diffMs / 3600000);
                                    const diffDays = Math.floor(diffMs / 86400000);
                                    
                                    if (diffMins < 1) return 'acum';
                                    if (diffMins < 60) return `acum ${diffMins} min`;
                                    if (diffHours < 24) return `acum ${diffHours} h`;
                                    if (diffDays === 1) return 'acum 1 zi';
                                    return `acum ${diffDays} zile`;
                                  })()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs truncate mb-1 text-gray-600 block">
                              {conv.product?.title}
                            </p>
                            {latestBid && (
                              <p className={`text-sm font-medium ${
                                latestBid.is_winning 
                                  ? 'text-green-600' 
                                  : 'text-gray-900'
                              }`}>
                                {formatPrice(latestBid.amount, conv.product?.currency || 'RON')}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            
            {/* Right Panel - Chat pentru conversația selectată - EXACT ca în my-products */}
            {selectedConversation?.productId && selectedConversation?.sellerId ? (
              <div className="flex-1 flex flex-col bg-white">
                {(() => {
                const conversations = getConversationsByProduct(selectedConversation.productId);
                const selectedConv = conversations.find(c => c.sellerId === selectedConversation.sellerId);
                if (!selectedConv) return null;
                
                const product = groupedBids.find(g => g.product?.id === selectedConversation.productId)?.product;
                if (!product) return null;
                
                const { bids: productBids } = selectedConv;
                const sortedBids = productBids.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const highestBid = Math.max(...productBids.map(b => b.amount || 0));
                const winningBids = productBids.filter(b => b.is_winning);
                const sellerInfo = selectedConv.sellerInfo;
                const sellerName = sellerInfo?.username || 
                  `${sellerInfo?.firstName || ''} ${sellerInfo?.lastName || ''}`.trim() || 
                  sellerInfo?.email || 
                  'Vânzător';
                
                return (
                  <>
                    {/* Header conversație */}
                    <div className="p-3 border-b border-gray-200 bg-white">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-gray-900">
                          {sellerName}
                        </h3>
                        <button
                          onClick={() => setSelectedConversation(null)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          <i className="ri-close-line text-lg text-gray-600"></i>
                        </button>
                      </div>
                    </div>
                    
                    {/* Card produs */}
                    <div className="p-4 border-b border-gray-200 bg-white">
                      <div className="flex gap-3">
                        <img
                          src={product.image || '/no-image-placeholder.svg'}
                          alt={product.title}
                          className="w-16 h-16 object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                          }}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-2 text-gray-900 block">
                            {product.title}
                          </p>
                          <div className="flex items-center gap-2">
                            {product.startingPrice && (
                              <span className="text-sm text-gray-500 line-through">
                                {new Intl.NumberFormat('ro-RO', {
                                  style: 'currency',
                                  currency: product.currency || 'RON',
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                }).format(product.startingPrice)}
                              </span>
                            )}
                            <span className="text-base font-semibold text-gray-900">
                              {new Intl.NumberFormat('ro-RO', {
                                style: 'currency',
                                currency: product.currency || 'RON',
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(highestBid)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Mesaje (oferte) - stil Vinted */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {/* Mesaj de la vânzător cu informații */}
                      <div className="flex gap-2">
                        {sellerInfo?.avatar_url ? (
                          <img
                            src={sellerInfo.avatar_url}
                            alt={sellerName}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700 flex-shrink-0">
                            {(sellerInfo?.firstName?.[0] || sellerInfo?.username?.[0] || 'V').toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="inline-block px-3 py-2 rounded-lg bg-gray-100 text-gray-900">
                            <p className="text-sm mb-1">
                              Salut, eu sunt {sellerName}
                            </p>
                            <p className="text-xs text-gray-600">
                              România
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Ultima conectare acum 27 de minute
                            </p>
                          </div>
                          <span className="text-xs text-gray-400 mt-1 block text-right">
                            acum 4 zile
                          </span>
                        </div>
                      </div>

                      {/* Oferte și mesaje prietenoase combinate și sortate cronologic */}
                      {(() => {
                        // Combină ofertele și mesajele prietenoase
                        const systemMessages = chatSystemMessages[product.id] || [];
                        // Inversează ordinea mesajelor prietenoase pentru a apărea corect
                        const reversedMessages = [...systemMessages].reverse();
                        const combinedItems: Array<{
                          type: 'bid' | 'message';
                          bid?: any;
                          message?: { id: string; message: string; timestamp: number; isAlert?: boolean };
                          timestamp: number;
                        }> = [
                          ...sortedBids.map(bid => ({
                            type: 'bid' as const,
                            bid,
                            timestamp: new Date(bid.created_at).getTime()
                          })),
                          ...reversedMessages.map(msg => ({
                            type: 'message' as const,
                            message: msg,
                            timestamp: msg.timestamp
                          }))
                        ];
                        
                        // Sortează după timestamp (ordine cronologică: cel mai vechi primul)
                        combinedItems.sort((a, b) => a.timestamp - b.timestamp);
                        
                        if (combinedItems.length === 0) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              <p>Nu există oferte încă</p>
                            </div>
                          );
                        }
                        
                        // Găsește ultima ofertă (nu mesaj de sistem)
                        const lastBidIndex = combinedItems
                          .map((item, idx) => ({ item, idx }))
                          .filter(({ item }) => item.type === 'bid')
                          .pop()?.idx ?? -1;
                        
                        return combinedItems.map((item, index) => {
                          if (item.type === 'message') {
                            // Mesaj prietenos sau alertă
                            const isAlert = item.message!.isAlert;
                            return (
                              <div key={item.message!.id} className="flex justify-center my-2">
                                <div className={`px-4 py-2 rounded-lg ${
                                  isAlert
                                    ? isDarkMode 
                                      ? 'bg-red-900/30 border border-red-500/30' 
                                      : 'bg-red-50 border border-red-200'
                                    : isDarkMode 
                                      ? 'bg-blue-900/30 border border-blue-500/30' 
                                      : 'bg-blue-50 border border-blue-200'
                                }`}>
                                  <p className={`text-sm text-center font-semibold ${
                                    isAlert
                                      ? isDarkMode ? 'text-red-200' : 'text-red-700'
                                      : isDarkMode ? 'text-blue-200' : 'text-blue-900'
                                  }`}>
                                    {item.message!.message}
                                  </p>
                                </div>
                              </div>
                            );
                          } else {
                            // Ofertă
                            const bid = item.bid!;
                            const isMyBid = bid.user_id === currentUserId;
                            const isWinning = bid.is_winning;
                            const isLastBid = index === lastBidIndex;
                            
                            return (
                              <div
                                key={bid.id}
                                className={`flex gap-2 ${isMyBid ? 'flex-row-reverse' : ''}`}
                              >
                                {!isMyBid && (
                                  <div className="flex-shrink-0">
                                    {sellerInfo?.avatar_url ? (
                                      <img
                                        src={sellerInfo.avatar_url}
                                        alt="Vânzător"
                                        className="w-8 h-8 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700">
                                        {(sellerInfo?.firstName?.[0] || sellerInfo?.username?.[0] || 'V').toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <div className={`flex-1 ${isMyBid ? 'flex flex-col items-end' : ''}`}>
                                  <div className={`inline-block px-3 py-2 rounded-lg ${
                                    isMyBid
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-gray-100 text-gray-900'
                                  }`}>
                                    <span className="text-base font-semibold">
                                      {new Intl.NumberFormat('ro-RO', {
                                        style: 'currency',
                                        currency: product.currency || 'RON',
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                      }).format(bid.amount)}
                                    </span>
                                    {isWinning && (
                                      <span className="text-xs opacity-90 block mt-1">✓ Acceptată</span>
                                    )}
                                    {bid.is_outbid && (
                                      <span className="text-xs opacity-90 block mt-1">Refuzată</span>
                                    )}
                                  </div>
                                  
                                  {/* Butoane pentru acțiuni - doar pentru ultima ofertă care nu este a mea și nu este acceptată/refuzată */}
                                  {!isMyBid && !isWinning && !bid.is_outbid && isLastBid && (
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={() => {
                                          const userName = sellerInfo?.username || 
                                            `${sellerInfo?.firstName || ''} ${sellerInfo?.lastName || ''}`.trim() || 
                                            sellerInfo?.email || 
                                            'Vânzător';
                                          setCounterOfferModalData({
                                            productId: product.id,
                                            bidId: bid.id,
                                            currentAmount: bid.amount,
                                            currency: product.currency || 'RON',
                                            userName: userName
                                          });
                                          setCounterOfferAmount('');
                                          setShowCounterOfferModal(true);
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                                      >
                                        Contraoferta
                                      </button>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const { data: sessionData } = await supabase.auth.getSession();
                                            if (!sessionData.session) return;
                                            
                                            const response = await dashboardApiFetch('/api/bids/accept', {
                                              method: 'POST',
                                              headers: {
                                                'Content-Type': 'application/json',
                                              },
                                              body: JSON.stringify({
                                                product_id: product.id,
                                                bid_id: bid.id,
                                              }),
                                            });
                                            
                                            if (response.ok) {
                                              await loadBids();
                                              setNotificationModal({
                                                show: true,
                                                message: 'Oferta a fost acceptată cu succes!',
                                                type: 'success',
                                              });
                                            } else {
                                              const result = await response.json();
                                              setNotificationModal({
                                                show: true,
                                                message: result.error || 'Eroare la acceptarea ofertei',
                                                type: 'error',
                                              });
                                            }
                                          } catch (error: any) {
                                            console.error('Error accepting bid:', error);
                                            setNotificationModal({
                                              show: true,
                                              message: 'Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'),
                                              type: 'error',
                                            });
                                          }
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                                      >
                                        Acceptă
                                      </button>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const { data: sessionData } = await supabase.auth.getSession();
                                            if (!sessionData.session) return;
                                            
                                            const response = await dashboardApiFetch('/api/bids/reject', {
                                              method: 'POST',
                                              headers: {
                                                'Content-Type': 'application/json',
                                              },
                                              body: JSON.stringify({
                                                bid_id: bid.id,
                                                product_id: product.id,
                                              }),
                                            });
                                            
                                            if (response.ok) {
                                              await loadBids();
                                              setNotificationModal({
                                                show: true,
                                                message: 'Oferta a fost refuzată',
                                                type: 'success',
                                              });
                                            } else {
                                              const result = await response.json();
                                              setNotificationModal({
                                                show: true,
                                                message: result.error || 'Eroare la refuzarea ofertei',
                                                type: 'error',
                                              });
                                            }
                                          } catch (error: any) {
                                            console.error('Error rejecting bid:', error);
                                            setNotificationModal({
                                              show: true,
                                              message: 'Eroare la refuzarea ofertei: ' + (error.message || 'Eroare necunoscută'),
                                              type: 'error',
                                            });
                                          }
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                                      >
                                        Refuză
                                      </button>
                                    </div>
                                  )}
                                  
                                  <span className={`text-xs mt-1 block ${isMyBid ? 'text-right' : ''} text-gray-400`}>
                                    {(() => {
                                      const date = new Date(bid.created_at);
                                      const now = new Date();
                                      const diffMs = now.getTime() - date.getTime();
                                      const diffMins = Math.floor(diffMs / 60000);
                                      const diffHours = Math.floor(diffMs / 3600000);
                                      const diffDays = Math.floor(diffMs / 86400000);
                                      
                                      if (diffMins < 1) return 'acum';
                                      if (diffMins < 60) return `acum ${diffMins} min`;
                                      if (diffHours < 24) return `acum ${diffHours} h`;
                                      if (diffDays === 1) return 'acum 1 zi';
                                      return `acum ${diffDays} zile`;
                                    })()}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                        });
                      })()}

                      {/* Mesaj de sistem - articol indisponibil */}
                      {productBids.filter((b: any) => b.is_winning).length > 0 && (
                        <div className="flex justify-center my-2">
                          <div className="text-center">
                            <p className="text-sm text-gray-600">Articolul nu este disponibil</p>
                            <p className="text-xs text-gray-500">Articolul a fost vândut sau șters</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Input pentru contraoferte */}
                    <div className="p-3 border-t border-gray-200 bg-white">
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                          <i className="ri-camera-line text-xl"></i>
                        </button>
                        <input
                          type="text"
                          value={newCounterOfferAmount[product.id] || ''}
                          onChange={(e) => {
                            const value: string = e.target.value;
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                              setNewCounterOfferAmount(prev => ({
                                ...prev,
                                [product.id]: value
                              }));
                            }
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const value = newCounterOfferAmount[product.id];
                              if (!value) return;
                              
                              const amount = parseFloat(value);
                              if (isNaN(amount) || amount <= 0) return;
                              
                              try {
                                const { data: sessionData } = await supabase.auth.getSession();
                                if (!sessionData.session) return;
                                
                                const response = await dashboardApiFetch('/api/bids', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    product_id: product.id,
                                    amount: amount,
                                  }),
                                });
                                
                                if (response.ok) {
                                  const result = await response.json();
                                  const bidId = (result as { bid?: { id?: string } })?.bid?.id;
                                  const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
                                  trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
                                  setNewCounterOfferAmount(prev => {
                                    const newState = { ...prev };
                                    delete newState[product.id];
                                    return newState;
                                  });
                                  
                                  // Adaugă mesaj prietenos în chat
                                  const { data: userData } = await supabase.auth.getUser();
                                  const userName = userData?.user?.user_metadata?.full_name || 
                                    userData?.user?.user_metadata?.name || 
                                    userData?.user?.email?.split('@')[0] || 
                                    'Tu';
                                  const messageId = `counter-offer-${Date.now()}`;
                                  setChatSystemMessages(prev => ({
                                    ...prev,
                                    [product.id]: [
                                      ...(prev[product.id] || []),
                                      {
                                        id: messageId,
                                        message: `${userName} dorește să vă facă o contraofertă`,
                                        timestamp: Date.now()
                                      }
                                    ]
                                  }));
                                  
                                  await loadBids();
                                  
                                  // Verifică dacă ultimele 2 oferte sunt de la același utilizator
                                  setTimeout(() => {
                                    const currentBids = productBids;
                                    const sortedProductBids = [...currentBids].sort((a, b) => 
                                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                    );
                                    
                                    if (sortedProductBids.length >= 2) {
                                      const lastBid = sortedProductBids[sortedProductBids.length - 1];
                                      const secondLastBid = sortedProductBids[sortedProductBids.length - 2];
                                      
                                      // Dacă ultimele 2 oferte sunt de la același utilizator, adaugă mesaj roșu
                                      if (lastBid.user_id === secondLastBid.user_id) {
                                        const alertMessageId = `counter-offer-alert-${Date.now()}`;
                                        setChatSystemMessages(prev => {
                                          const existing = prev[product.id] || [];
                                          const hasAlert = existing.some(m => m.isAlert && m.message.includes('altă'));
                                          if (hasAlert) return prev;
                                          return {
                                            ...prev,
                                            [product.id]: [
                                              ...existing,
                                              {
                                                id: alertMessageId,
                                                message: `S-a făcut o altă contraofertă`,
                                                timestamp: Date.now(),
                                                isAlert: true
                                              }
                                            ]
                                          };
                                        });
                                      }
                                    }
                                  }, 500);
                                } else {
                                  const result = await response.json();
                                  setNotificationModal({
                                    show: true,
                                    message: result.error || 'Eroare la trimiterea contraofertei',
                                    type: 'error',
                                  });
                                }
                              } catch (error: any) {
                                console.error('Error placing counter offer:', error);
                                setNotificationModal({
                                  show: true,
                                  message: 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'),
                                  type: 'error',
                                });
                              }
                            }
                          }}
                          placeholder="Scrie un mesaj aici"
                          className="flex-1 px-3 py-2 rounded-lg border bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={async () => {
                            const value = newCounterOfferAmount[product.id];
                            if (!value) return;
                            
                            const amount = parseFloat(value);
                            if (isNaN(amount) || amount <= 0) return;
                            
                            try {
                              const { data: sessionData } = await supabase.auth.getSession();
                              if (!sessionData.session) return;
                              
                              const response = await dashboardApiFetch('/api/bids', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  product_id: product.id,
                                  amount: amount,
                                }),
                              });
                              
                                if (response.ok) {
                                  const result = await response.json();
                                  const bidId = (result as { bid?: { id?: string } })?.bid?.id;
                                  const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
                                  trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
                                  setNewCounterOfferAmount(prev => {
                                  const newState = { ...prev };
                                  delete newState[product.id];
                                  return newState;
                                });
                                
                                // Adaugă mesaj prietenos în chat
                                const { data: userData } = await supabase.auth.getUser();
                                const userName = userData?.user?.user_metadata?.full_name || 
                                  userData?.user?.user_metadata?.name || 
                                  userData?.user?.email?.split('@')[0] || 
                                  'Tu';
                                const messageId = `counter-offer-${Date.now()}`;
                                setChatSystemMessages(prev => ({
                                  ...prev,
                                  [product.id]: [
                                    ...(prev[product.id] || []),
                                    {
                                      id: messageId,
                                      message: `${userName} dorește să vă facă o contraofertă`,
                                      timestamp: Date.now()
                                    }
                                  ]
                                }));
                                
                                await loadBids();
                              } else {
                                const result = await response.json();
                                setNotificationModal({
                                  show: true,
                                  message: result.error || 'Eroare la trimiterea contraofertei',
                                  type: 'error',
                                });
                              }
                            } catch (error: any) {
                              console.error('Error placing counter offer:', error);
                              setNotificationModal({
                                show: true,
                                message: 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'),
                                type: 'error',
                              });
                            }
                          }}
                          className="p-2 text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          <i className="ri-arrow-right-line text-xl"></i>
                        </button>
                      </div>
                    </div>
                  </>
                );
                })()}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-4 text-gray-500">
                  <i className="ri-inbox-line text-2xl mb-2"></i>
                  <p className="text-xs">Selectează o conversație pentru a vedea ofertele</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat Modal */}
      {showChatModal && chatData && currentUserId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowChatModal(false);
            }
          }}
        >
          <div className={`w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <ProductChat
              productId={chatData.productId}
              buyerId={chatData.buyerId}
              sellerId={chatData.sellerId}
              currentUserId={currentUserId}
              isDarkMode={isDarkMode}
              onClose={() => setShowChatModal(false)}
              otherUserInfo={chatData.otherUserInfo}
            />
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedReviewUserId && selectedReviewUserInfo && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 lg:p-6"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
          }}
          onClick={() => {
            setShowReviewModal(false);
            setSelectedReviewUserId(null);
            setSelectedReviewProductId(null);
            setSelectedReviewType(null);
            setSelectedReviewUserInfo(null);
          }}
        >
          <div 
            className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-4 border-b ${
              isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Lasă o recenzie
                </h3>
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedReviewUserId(null);
                    setSelectedReviewProductId(null);
                    setSelectedReviewType(null);
                    setSelectedReviewUserInfo(null);
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                    isDarkMode ? 'hover:bg-gray-700' : ''
                  }`}
                >
                  <i className={`ri-close-line text-lg ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}></i>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <UserReviews
                userId={selectedReviewUserId || ''}
                productId={selectedReviewProductId || undefined}
                reviewType={selectedReviewType || undefined}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Review Modal - Modern Design */}
      {showReviewModal && selectedReviewUserId && selectedReviewUserInfo && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 lg:p-6"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
          }}
          onClick={() => {
            setShowReviewModal(false);
            setSelectedReviewUserId(null);
            setSelectedReviewProductId(null);
            setSelectedReviewType(null);
            setSelectedReviewUserInfo(null);
          }}
        >
          <div 
            className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-4 border-b ${
              isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Lasă o recenzie
                </h3>
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedReviewUserId(null);
                    setSelectedReviewProductId(null);
                    setSelectedReviewType(null);
                    setSelectedReviewUserInfo(null);
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                    isDarkMode ? 'hover:bg-gray-700' : ''
                  }`}
                >
                  <i className={`ri-close-line text-lg ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}></i>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <UserReviews
                userId={selectedReviewUserId || ''}
                productId={selectedReviewProductId || undefined}
                reviewType={selectedReviewType || undefined}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Counter Offer Modal - Prietenos */}
      {showCounterOfferModal && counterOfferModalData && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ 
            backdropFilter: 'blur(12px)', 
            WebkitBackdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
          }}
          onClick={() => {
            setShowCounterOfferModal(false);
            setCounterOfferModalData(null);
            setCounterOfferAmount('');
          }}
        >
          <div 
            className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              {/* Suma mare în centru */}
              <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button
                    onClick={() => {
                      const current = parseFloat(counterOfferAmount) || counterOfferModalData.currentAmount || 0;
                      const newAmount = Math.max(0, current - 10);
                      setCounterOfferAmount(newAmount.toString());
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold transition-all ${
                      isDarkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    −
                  </button>
                  
                  <div className="flex-1">
                    <input
                      type="text"
                      value={counterOfferAmount || ''}
                      onChange={(e) => {
                        const value: string = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setCounterOfferAmount(value);
                        }
                      }}
                      placeholder={formatPrice(counterOfferModalData.currentAmount || 0, counterOfferModalData.currency)}
                      className={`w-full text-center text-4xl font-bold bg-transparent outline-none ${
                        isDarkMode ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'
                      }`}
                      autoFocus
                    />
                  </div>
                  
                  <button
                    onClick={() => {
                      const current = parseFloat(counterOfferAmount) || counterOfferModalData.currentAmount || 0;
                      const newAmount = current + 10;
                      setCounterOfferAmount(newAmount.toString());
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold transition-all ${
                      isDarkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    +
                  </button>
                </div>
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {counterOfferModalData.currency}
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCounterOfferModal(false);
                    setCounterOfferModalData(null);
                    setCounterOfferAmount('');
                  }}
                  className={`flex-1 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all ${
                    isDarkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Anulează
                </button>
                <button
                  onClick={async () => {
                    const amount = parseFloat(counterOfferAmount);
                    if (!counterOfferAmount || isNaN(amount) || amount <= 0) {
                      setNotificationModal({
                        show: true,
                        message: 'Te rugăm să introduci o sumă validă',
                        type: 'error',
                      });
                      return;
                    }
                    
                    try {
                      const { data: sessionData } = await supabase.auth.getSession();
                      if (!sessionData.session) {
                        setNotificationModal({
                          show: true,
                          message: 'Trebuie să fii autentificat',
                          type: 'error',
                        });
                        return;
                      }
                      
                      const response = await dashboardApiFetch('/api/bids', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          product_id: counterOfferModalData.productId,
                          amount: amount,
                        }),
                      });
                      
                      if (response.ok) {
                        setShowCounterOfferModal(false);
                        setCounterOfferModalData(null);
                        setCounterOfferAmount('');
                        
                        // Adaugă mesaj prietenos în chat - pentru cumpărător
                        const messageId = `counter-offer-${Date.now()}`;
                        setChatSystemMessages(prev => ({
                          ...prev,
                          [counterOfferModalData.productId]: [
                            ...(prev[counterOfferModalData.productId] || []),
                            {
                              id: messageId,
                              message: `Ai trimis o contraofertă`,
                              timestamp: Date.now()
                            }
                          ]
                        }));
                        
                        await loadBids();
                        
                        // Verifică dacă ultimele 2 oferte sunt de la același utilizator
                        setTimeout(() => {
                          const productBids = bids.filter(b => b.product?.id === counterOfferModalData.productId);
                          const sortedProductBids = [...productBids].sort((a, b) => 
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                          );
                          
                          if (sortedProductBids.length >= 2) {
                            const lastBid = sortedProductBids[sortedProductBids.length - 1];
                            const secondLastBid = sortedProductBids[sortedProductBids.length - 2];
                            
                            // Dacă ultimele 2 oferte sunt de la același utilizator, adaugă mesaj roșu
                            if (lastBid.user_id === secondLastBid.user_id) {
                              const alertMessageId = `counter-offer-alert-${Date.now()}`;
                              setChatSystemMessages(prev => {
                                const existing = prev[counterOfferModalData.productId] || [];
                                const hasAlert = existing.some(m => m.isAlert && m.message.includes('altă'));
                                if (hasAlert) return prev;
                                return {
                                  ...prev,
                                  [counterOfferModalData.productId]: [
                                    ...existing,
                                    {
                                      id: alertMessageId,
                                      message: `S-a făcut o altă contraofertă`,
                                      timestamp: Date.now(),
                                      isAlert: true
                                    }
                                  ]
                                };
                              });
                            }
                          }
                        }, 500);
                      } else {
                        const result = await response.json();
                        setNotificationModal({
                          show: true,
                          message: result.error || 'Eroare la trimiterea contraofertei',
                          type: 'error',
                        });
                      }
                    } catch (error: any) {
                      console.error('Error placing counter offer:', error);
                      setNotificationModal({
                        show: true,
                        message: 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'),
                        type: 'error',
                      });
                    }
                  }}
                  className="flex-1 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  Confirmă contraoferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notificationModal.show && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)' 
          }}
          onClick={() => setNotificationModal({ show: false, message: '', type: 'info' })}
        >
          <div 
            className={`relative w-full max-w-md rounded-2xl shadow-2xl transform transition-all duration-300 ${
              notificationModal.show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            } ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon and Message */}
            <div className="p-6 text-center">
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                notificationModal.type === 'success'
                  ? isDarkMode
                    ? 'bg-green-500/20 border-2 border-green-500/50'
                    : 'bg-green-100 border-2 border-green-300'
                  : notificationModal.type === 'error'
                  ? isDarkMode
                    ? 'bg-red-500/20 border-2 border-red-500/50'
                    : 'bg-red-100 border-2 border-red-300'
                  : isDarkMode
                  ? 'bg-blue-500/20 border-2 border-blue-500/50'
                  : 'bg-blue-100 border-2 border-blue-300'
              }`}>
                <i className={`text-3xl ${
                  notificationModal.type === 'success'
                    ? 'ri-checkbox-circle-fill text-green-500'
                    : notificationModal.type === 'error'
                    ? 'ri-error-warning-fill text-red-500'
                    : 'ri-information-fill text-blue-500'
                }`}></i>
              </div>
              <h3 className={`text-xl font-bold mb-2 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {notificationModal.type === 'success'
                  ? 'Succes!'
                  : notificationModal.type === 'error'
                  ? 'Eroare'
                  : 'Informație'}
              </h3>
              <p className={`text-base ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {notificationModal.message}
              </p>
            </div>
            
            {/* Close Button */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setNotificationModal({ show: false, message: '', type: 'info' })}
                className={`w-full px-4 py-2 rounded-lg font-semibold transition-colors ${
                  notificationModal.type === 'success'
                    ? isDarkMode
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                    : notificationModal.type === 'error'
                    ? isDarkMode
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                    : isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Review Modal - Modern Design */}
      {showReviewModal && selectedReviewUserId && selectedReviewUserInfo && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 lg:p-6"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
          }}
          onClick={() => {
            setShowReviewModal(false);
            setSelectedReviewUserId(null);
            setSelectedReviewProductId(null);
            setSelectedReviewType(null);
            setSelectedReviewUserInfo(null);
          }}
        >
          <div 
            className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-4 border-b ${
              isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Lasă o recenzie
                </h3>
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedReviewUserId(null);
                    setSelectedReviewProductId(null);
                    setSelectedReviewType(null);
                    setSelectedReviewUserInfo(null);
                  }}
                  className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                    isDarkMode ? 'hover:bg-gray-700' : ''
                  }`}
                >
                  <i className={`ri-close-line text-lg ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}></i>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-2 sm:p-3 lg:p-4" style={{ 
              maxHeight: 'calc(85vh - 100px)',
              WebkitOverflowScrolling: 'touch'
            }}>
              {selectedReviewUserId && selectedReviewType && (
                <UserReviews
                  userId={selectedReviewUserId}
                  reviewType={selectedReviewType}
                  isDarkMode={isDarkMode}
                  showAddReview={currentUserId !== selectedReviewUserId}
                  productId={selectedReviewProductId || undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
