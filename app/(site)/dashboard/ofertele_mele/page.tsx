"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type {
  AuthChangeEvent,
  RealtimePostgresChangesPayload,
  Session,
} from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  hasDashboardLocalAuthEvidence,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import { getSupabaseAccessTokenRobust } from "@/lib/auth/getSupabaseSessionRobust";
import { QRCodeSVG } from "qrcode.react";

const UniversalHeader = dynamic(() => import("@/components/UniversalHeader"), { ssr: true });
const DashboardFooter = dynamic(() => import("@/components/DashboardFooter"), { ssr: true });
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { BackButton } from "@/components/ui/back-button";

type UserChatMessageRow = {
  id: string;
  sender_user_id?: string | null;
  message_text?: string | null;
  created_at: string;
  read_at?: string | null;
  is_system_message?: boolean | null;
  metadata?: unknown;
};

type UserChatRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  updated_at?: string;
  last_message_at?: string | null;
};

interface Product {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  startingPrice: number;
  currency: 'RON' | 'EUR';
  images: (string | { type: 'zip'; url?: string })[];
  user_id?: string;
  customFields?: Record<string, any>;
}

interface Conversation {
  // Tip de conversație
  type?: 'product' | 'user'; // 'product' pentru product_chats, 'user' pentru user_chats
  
  // Câmpuri pentru product_chats
  productId: string;
  sellerId: string;
  buyerId?: string; // For received bids (user is seller), this is the buyer's ID
  sellerInfo: any;
  bids: any[];
  latestBid: any;
  highestBid: number;
  product: Product;
  chatId?: string; // ID-ul din product_chats (pentru product conversations)

  // Câmpuri pentru user_chats (opționale)
  userChatId?: string; // ID-ul din user_chats
  otherUserId?: string; // ID-ul celuilalt utilizator
  otherUserInfo?: any; // Informații despre celălalt utilizator
  lastMessage?: string; // Ultimul mesaj
  lastMessageAt?: string; // Timestamp ultimul mesaj
}

export default function OferteleMelePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Pentru a forța refresh
  const [selectedConversation, setSelectedConversation] = useState<{ 
    type?: 'product' | 'user';
    productId?: string; // optional for user_chats (no product)
    sellerId: string; 
    buyerId?: string;
    userChatId?: string;
  } | null>(null);
  // Conversația a fost deschisă prin „Scrie mesaj” (productId+sellerId în URL) → afișăm doar atunci input + „Plasează oferta”
  const [openedViaScrieMesaj, setOpenedViaScrieMesaj] = useState<{ productId: string; sellerId: string } | null>(null);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [loadingBids, setLoadingBids] = useState<boolean>(false);
  const [newCounterOfferAmount, setNewCounterOfferAmount] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<Record<string, Array<{
    id: string;
    sender_user_id: string | null;
    message_text: string;
    created_at: string;
    is_read: boolean;
  }>>>({});
  const [chatIds, setChatIds] = useState<Record<string, string>>({}); // conversationKey -> chatId
  // State pentru chat-urile blocate: key = conversationKey, value = { blocked_by_seller: boolean, blocked_by_buyer: boolean }
  const [blockedChats, setBlockedChats] = useState<Record<string, { blocked_by_seller: boolean; blocked_by_buyer: boolean }>>({});
  // State pentru mesaje necitite: key = `${productId}-${sellerId}` sau `${productId}-${buyerId}`, value = număr total (mesaje + oferte)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // State pentru contraoferte și oferte acceptate
  const [counterOfferAmount, setCounterOfferAmount] = useState<Record<string, number>>({});
  const [acceptedBids, setAcceptedBids] = useState<Record<string, { bidId: string; acceptedAt: number }>>({});
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [placeOfferAmount, setPlaceOfferAmount] = useState<Record<string, string>>({});
  const [placingOffer, setPlacingOffer] = useState<Record<string, boolean>>({});
  // State pentru follow, like, dislike
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [likedBids, setLikedBids] = useState<Set<string>>(new Set());
  const [dislikedBids, setDislikedBids] = useState<Set<string>>(new Set());
  // State pentru contori like/dislike per conversație
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({}); // conversationKey -> count
  const [dislikeCounts, setDislikeCounts] = useState<Record<string, number>>({}); // conversationKey -> count
  
  // Resetează contoarele la 0 când componenta se montează
  useEffect(() => {
    setLikeCounts({});
    setDislikeCounts({});
  }, []);

  // State pentru informații despre utilizator (rating, urmăritori, etc.)
  const [userStats, setUserStats] = useState<Record<string, {
    rating: number;
    positivePercent: number;
    lastConnection: string | null;
    followers: number;
    following: number;
    reviewCount: number;
  }>>({});
  // State pentru modal contraoferta
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [counterOfferModalData, setCounterOfferModalData] = useState<{
    productId: string;
    bidId: string;
    currentAmount: number;
    currency: string;
    userName: string;
  } | null>(null);
  const [counterOfferAmountModal, setCounterOfferAmountModal] = useState<string>('');
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationModal, setNotificationModal] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);
  // State pentru modal confirmare modul privacy
  const [showPrivacyModeModal, setShowPrivacyModeModal] = useState(false);
  const [privacyModeModalConversationKey, setPrivacyModeModalConversationKey] = useState<string | null>(null);
  const [privacyModeModalAction, setPrivacyModeModalAction] = useState<'block' | 'unblock' | null>(null);
  const [privacyModeSkipConfirmation, setPrivacyModeSkipConfirmation] = useState(false);
  // State pentru imagini
  const [showPrivacyModeTooltip, setShowPrivacyModeTooltip] = useState<string | null>(null); // conversationKey
  const [showMobileMenu, setShowMobileMenu] = useState(false); // Meniu mobil
  const [showReportModal, setShowReportModal] = useState(false); // Modal raportare
  // State pentru modal confirmare ștergere conversație
  const [showDeleteConversationModal, setShowDeleteConversationModal] = useState(false);
  const [deleteConversationKey, setDeleteConversationKey] = useState<string | null>(null);
  const [deleteConversationIsReport, setDeleteConversationIsReport] = useState(false);
  const [mobileBottomInset, setMobileBottomInset] = useState(0);
  const [reportForm, setReportForm] = useState({
    productTitle: '',
    reportedUserName: '',
    reporterName: '',
    reason: '',
    description: '',
    conversationId: '',
  });
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set()); // Utilizatori blocați de mine
  const [usersBlockedMe, setUsersBlockedMe] = useState<Set<string>>(new Set()); // Utilizatori care m-au blocat
  
  // State pentru produsele vizionate recent
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<Array<{
    id: string;
    title: string;
    image?: string;
    price?: number;
    currency?: string;
    slug?: string;
    url?: string;
    viewedAt: number;
  }>>([]);
  const recentlyViewedScrollRef = useRef<HTMLDivElement>(null);
  // State pentru conversațiile de rapoarte
  const [reportChats, setReportChats] = useState<any[]>([]); // Conversații de rapoarte
  const [reportChatMessages, setReportChatMessages] = useState<Record<string, any[]>>({}); // chatId -> messages
  const [selectedReportChat, setSelectedReportChat] = useState<string | null>(null); // chatId selectat
  const [selectedImages, setSelectedImages] = useState<Record<string, File[]>>({}); // conversationKey -> File[]
  const [imagePreviews, setImagePreviews] = useState<Record<string, string[]>>({}); // conversationKey -> preview URLs
  const fileInputRef = useRef<Record<string, HTMLInputElement | null>>({});
  // State pentru modal imagine galerie
  const [imageModalUrls, setImageModalUrls] = useState<string[]>([]);
  const [imageModalCurrentIndex, setImageModalCurrentIndex] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const allConversationsRef = useRef<Conversation[]>([]);
  const loadChatMessagesRef = useRef<any>(null);
  
  // State pentru conversațiile fixate (mutate sus) - folosim array ordonat pentru a păstra ordinea
  const [pinnedConversations, setPinnedConversations] = useState<string[]>([]);
  
  // State pentru conversațiile favorite (gradient galben, fără mutare)
  const [favoriteConversations, setFavoriteConversations] = useState<Set<string>>(new Set());
  
  // State pentru watchlist (produse urmărite)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  
  // State pentru drag and drop
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [draggedOverKey, setDraggedOverKey] = useState<string | null>(null);
  
  // State pentru context menu și swipe
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationKey: string } | null>(null);
  const [swipedConversation, setSwipedConversation] = useState<string | null>(null);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [hiddenConversations, setHiddenConversations] = useState<Set<string>>(new Set());
  const [hiddenReportChats, setHiddenReportChats] = useState<Set<string>>(new Set());
  
  const [swipedReportChat, setSwipedReportChat] = useState<string | null>(null);
  const [swipeReportOffset, setSwipeReportOffset] = useState<number>(0);
  const [swipeReportStartX, setSwipeReportStartX] = useState<number | null>(null);
  
  // State pentru reactions (WhatsApp style) - suportă orice emoji
  const [messageReactions, setMessageReactions] = useState<Record<string, {
    reactions: Record<string, { count: number; userIds: string[] }>;
    userReactions: string[];
  }>>({}); // key = `${messageType}-${messageId}`
  
  const [showEmojiReactionPicker, setShowEmojiReactionPicker] = useState<{
    messageId: string;
    messageType: 'product_chat' | 'report_chat';
    x: number;
    y: number;
  } | null>(null);
  
  // State pentru long-press pe mobil (WhatsApp style)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressStartRef = useRef<{ messageId: string; messageType: 'product_chat' | 'report_chat'; x: number; y: number } | null>(null);
  
  // State pentru profilul utilizatorului curent
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    first_name?: string;
    last_name?: string;
    username?: string;
    email?: string;
    avatar_url?: string;
    is_admin?: boolean;
  } | null>(null);

  // Funcție pentru afișarea notificărilor - folosim useRef pentru a evita problemele de closure
  const showNotificationRef = useRef<{
    show: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  }>({
    show: (type: 'success' | 'error' | 'info', title: string, message: string) => {
      setNotificationModal({ type, title, message });
      setShowNotificationModal(true);
    }
  });
  
  // Încarcă conversațiile fixate și favorite din Supabase user_settings
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!currentUserId) return;

      try {
        // Încarcă pinned conversations din Supabase
        const { data: pinnedSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'pinned_conversations')
          .maybeSingle();

        if (pinnedSettings?.data?.conversations && Array.isArray(pinnedSettings.data.conversations)) {
          setPinnedConversations(pinnedSettings.data.conversations);
        }

        // Încarcă favorite conversations din Supabase
        const { data: favoriteSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'favorite_conversations')
          .maybeSingle();

        if (favoriteSettings?.data?.conversations && Array.isArray(favoriteSettings.data.conversations)) {
          setFavoriteConversations(new Set(favoriteSettings.data.conversations));
        }
      } catch (error) {
        console.error('Error loading user preferences:', error);
      }
    };

    loadUserPreferences();
  }, [currentUserId]);

  // Încarcă watchlist-ul din Supabase
  useEffect(() => {
    const loadWatchlist = async () => {
      if (!currentUserId) return;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;

        const response = await dashboardApiFetch('/api/user/watchlist', {
          headers: {
          },
        });

        if (response.ok) {
          const watchlistData = await response.json();
          const productIds = new Set<string>(
            (Array.isArray(watchlistData) ? watchlistData : [])
              .map((item: any) => item?.product_id)
              .filter((id): id is string => typeof id === 'string')
          );
          setWatchlist(productIds);
        }
      } catch (error) {
        console.error('Error loading watchlist:', error);
      }
    };

    loadWatchlist();
  }, [currentUserId]);

  // Load recently viewed products from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('recentlyViewedProducts');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Sort by viewedAt descending and limit to 100
          const sorted = Array.isArray(parsed)
            ? parsed
                .sort((a: any, b: any) => b.viewedAt - a.viewedAt)
                .slice(0, 100)
            : [];
          setRecentlyViewedProducts(sorted);
        }
      } catch (error) {
        console.error('Error loading recently viewed products:', error);
      }
    }
  }, []);

  // Detect bottom system buttons/insets on mobile app/webview and keep chat input above them.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateBottomInset = () => {
      if (window.innerWidth >= 768) {
        setMobileBottomInset(0);
        return;
      }

      const vv = window.visualViewport;
      // 1) Most reliable when browser/app chrome or keyboard changes viewport.
      const fromVisualViewport = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
      // 2) Helps on some Android WebViews where visualViewport is not enough.
      const fromOuter = Math.max(0, window.outerHeight - window.innerHeight);
      // 3) Additional fallback for specific devices/status bars.
      const fromScreen = Math.max(0, window.screen.height - window.innerHeight - 24);
      const fromAvail = Math.max(0, window.screen.height - window.screen.availHeight);

      // Use the strongest signal, clamped to sane mobile range.
      const computed = Math.min(120, Math.max(fromVisualViewport, fromOuter, fromScreen, fromAvail));
      setMobileBottomInset(computed);
    };

    updateBottomInset();
    window.addEventListener("resize", updateBottomInset);
    window.addEventListener("orientationchange", updateBottomInset);
    window.visualViewport?.addEventListener("resize", updateBottomInset);
    window.visualViewport?.addEventListener("scroll", updateBottomInset);

    return () => {
      window.removeEventListener("resize", updateBottomInset);
      window.removeEventListener("orientationchange", updateBottomInset);
      window.visualViewport?.removeEventListener("resize", updateBottomInset);
      window.visualViewport?.removeEventListener("scroll", updateBottomInset);
    };
  }, []);

  // Detectează parametrul userChatId din URL și deschide automat chat-ul
  useEffect(() => {
    const userChatId = searchParams.get('userChatId');
    const unhide = searchParams.get('unhide') === 'true';
    
    if (!userChatId || !currentUserId) return;

    // Funcție pentru a încerca să găsească și să deschidă chat-ul
    const openUserChat = async () => {
      try {
        // Încarcă informații despre chat din user_chats
        const { data: userChat, error } = await supabase
          .from('user_chats')
          .select('user1_id, user2_id')
          .eq('id', userChatId)
          .maybeSingle();

        if (error || !userChat) {
          console.error('Chat not found:', error);
          // Curăță parametrul din URL
          router.replace('/dashboard/ofertele_mele');
          return;
        }

        // Determină ID-ul celuilalt utilizator
        const otherUserId = userChat.user1_id === currentUserId ? userChat.user2_id : userChat.user1_id;
        
        // Calculează conversation key (același format ca în UI)
        const conversationKey = `user-chat-${userChatId}-${otherUserId}`;

        // Dacă parametrul unhide=true, elimină chat-ul din hiddenConversations
        if (unhide) {
          console.log('🔄 [RESTORE] Starting restore for:', conversationKey);
          
          // Elimină din state local
          setHiddenConversations(prev => {
            const newSet = new Set(prev);
            const deleted = newSet.delete(conversationKey);
            console.log('🔄 [RESTORE] Deleted from local state:', deleted, 'New size:', newSet.size);
            return newSet;
          });

          // Elimină din Supabase user_settings (categoria corectă pentru user_chats)
          try {
            const { data: existingSettings } = await supabase
              .from('user_settings')
              .select('data')
              .eq('user_id', currentUserId)
              .eq('category', 'hidden_user_chats')
              .maybeSingle();

            console.log('🔄 [RESTORE] Existing hidden list:', existingSettings?.data?.conversations);

            const hiddenList = existingSettings?.data?.conversations || [];
            const updatedList = hiddenList.filter((key: string) => key !== conversationKey);

            console.log('🔄 [RESTORE] Updated list (removed):', updatedList);

            const { error: upsertError } = await supabase
              .from('user_settings')
              .upsert({
                user_id: currentUserId,
                category: 'hidden_user_chats',
                data: { conversations: updatedList }
              }, {
                onConflict: 'user_id,category'
              });
            
            if (upsertError) {
              console.error('🔄 [RESTORE] Error upserting:', upsertError);
            } else {
              console.log('✅ [RESTORE] Successfully removed from hidden_user_chats:', conversationKey);
            }
          } catch (err) {
            console.error('❌ [RESTORE] Error updating hidden conversations:', err);
          }

          // Reîncarcă conversațiile pentru a afișa chat-ul restaurat
          // Forțează reload prin refresh sau manual
          console.log('🔄 [RESTORE] Reloading page in 200ms...');
          setTimeout(() => {
            window.location.reload();
          }, 200);
        }
        
        // Curăță parametrii din URL
        router.replace('/dashboard/ofertele_mele');
        
        console.log('User chat restored:', { userChatId, otherUserId, unhide });
      } catch (err) {
        console.error('Error opening user chat:', err);
        router.replace('/dashboard/ofertele_mele');
      }
    };

    openUserChat();
  }, [searchParams, currentUserId, router]);

  // Deschide conversația produs (ca la ofertă) când vine din live_bid prin "Scrie mesaj" + trimite automat "Salutare!"
  useEffect(() => {
    const productId = searchParams.get('productId');
    const sellerId = searchParams.get('sellerId');
    if (!productId || !sellerId || !currentUserId) return;

    setSelectedConversation({
      type: 'product',
      productId,
      sellerId,
      // buyerId absent = aceeași cheie ca la "oferte făcute" (productId-sellerId)
    });
    setOpenedViaScrieMesaj({ productId, sellerId });

    (async () => {
      try {
        const accessToken = await getSupabaseAccessTokenRobust(supabase);
        if (!accessToken) {
          router.replace('/dashboard/ofertele_mele');
          return;
        }
        const res = await dashboardApiFetch('/api/product-chat/messages', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            buyerId: currentUserId,
            messageText: 'Salutare!',
          }),
        });
        if (res.ok) setRefreshTrigger((r) => r + 1);
      } catch {
        // ignore
      } finally {
        router.replace('/dashboard/ofertele_mele');
      }
    })();
  }, [searchParams, currentUserId, router]);

  // Când utilizatorul selectează altă conversație (din listă), ascundem blocul „Scrie mesaj” (input + Plasează oferta)
  useEffect(() => {
    if (!openedViaScrieMesaj) return;
    if (!selectedConversation || selectedConversation.type !== 'product') {
      setOpenedViaScrieMesaj(null);
      return;
    }
    if (selectedConversation.productId !== openedViaScrieMesaj.productId || selectedConversation.sellerId !== openedViaScrieMesaj.sellerId) {
      setOpenedViaScrieMesaj(null);
    }
  }, [selectedConversation, openedViaScrieMesaj]);
  
  // Funcție pentru toggle pin (mutare sus)
  const togglePin = useCallback(async (uniqueKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;

    const newArray = [...pinnedConversations];
    const index = newArray.indexOf(uniqueKey);
    if (index > -1) {
      // Elimină din listă
      newArray.splice(index, 1);
    } else {
      // Adaugă la începutul listei pentru a o muta sus
      newArray.unshift(uniqueKey);
    }

    // Actualizează state-ul imediat
    setPinnedConversations(newArray);

    // Salvează în Supabase (upsert - actualizează sau inserează)
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: currentUserId,
          category: 'pinned_conversations',
          data: { conversations: newArray },
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving pinned conversations:', error);
      }
    } catch (error) {
      console.error('Error saving pinned conversations:', error);
    }
  }, [currentUserId, pinnedConversations]);
  
  // Funcție pentru toggle favorite (gradient galben, fără mutare)
  const toggleFavorite = useCallback(async (uniqueKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;

    const newSet = new Set(favoriteConversations);
    if (newSet.has(uniqueKey)) {
      newSet.delete(uniqueKey);
    } else {
      newSet.add(uniqueKey);
    }

    // Actualizează state-ul imediat
    setFavoriteConversations(newSet);

    // Salvează în Supabase (upsert - actualizează sau inserează)
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: currentUserId,
          category: 'favorite_conversations',
          data: { conversations: Array.from(newSet) },
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving favorite conversations:', error);
      }
    } catch (error) {
      console.error('Error saving favorite conversations:', error);
    }
  }, [currentUserId, favoriteConversations]);

  // Funcție pentru ascunderea conversației de raportare
  const hideReportChat = useCallback(async (chatId: string) => {
    if (!currentUserId) return;

    console.log('[hideReportChat] Hiding report chat:', chatId);

    try {
      // Ascunde local imediat folosind doar hiddenReportChats
      setHiddenReportChats(prev => {
        const newSet = new Set(prev).add(chatId);
        console.log('[hideReportChat] Updated hiddenReportChats:', Array.from(newSet));
        return newSet;
      });
      
      // Resetează conversația selectată dacă este cea care se șterge
      if (selectedReportChat === chatId) {
        setSelectedReportChat(null);
        setSelectedConversation(null);
      }
      
      setContextMenu(null);
      setSwipedReportChat(null);
      setSwipeReportOffset(0);

      // WORKAROUND SIMPLIFICAT: Salvează în user_settings în loc să modifice report_chats
      console.log('[hideReportChat] Saving to user_settings');
      console.log('[hideReportChat] Chat ID:', chatId);
      console.log('[hideReportChat] User ID:', currentUserId);
      
      try {
        // Obține lista curentă de chat-uri ascunse
        const { data: existingSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'hidden_report_chats')
          .maybeSingle();

        const hiddenList = existingSettings?.data?.chats || [];
        console.log('[hideReportChat] Current hidden list:', hiddenList);
        
        if (!hiddenList.includes(chatId)) {
          const updatedList = [...hiddenList, chatId];
          console.log('[hideReportChat] Updated hidden list:', updatedList);
          
          const { error: settingsError } = await supabase
            .from('user_settings')
            .upsert({
              user_id: currentUserId,
              category: 'hidden_report_chats',
              data: { chats: updatedList },
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,category'
            });

          if (settingsError) {
            console.error('[hideReportChat] Error saving to user_settings:', settingsError);
            throw new Error('Eroare la salvarea în user_settings');
          }
        }
        
        console.log('[hideReportChat] Successfully saved to user_settings');
        showNotificationRef.current.show('success', 'Succes', 'Conversația a fost ștearsă');
      } catch (saveError: any) {
        console.error('[hideReportChat] Error in save process:', saveError);
        showNotificationRef.current.show('error', 'Eroare', 'Eroare la ascunderea conversației');
        // Restaurează conversația
        setHiddenReportChats(prev => {
          const newSet = new Set(prev);
          newSet.delete(chatId);
          return newSet;
        });
        return;
      }
    } catch (error: any) {
      console.error('[hideReportChat] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', `Eroare la ascunderea conversației: ${error.message || 'Eroare necunoscută'}`);
      // Restaurează conversația
      setHiddenReportChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
    }
  }, [currentUserId, selectedReportChat, setSelectedConversation]);

  // Funcție pentru ascunderea conversației
  const hideConversation = useCallback(async (conversationKey: string) => {
    if (!currentUserId) return;

    try {
      const chatId = chatIds[conversationKey];
      
      // Ascunde local imediat (pentru UI responsiveness)
      setHiddenConversations(prev => new Set(prev).add(conversationKey));
      
      // Resetează conversațiile selectate pentru a ieși înapoi la lista de chat-uri
      setSelectedConversation(null);
      setSelectedReportChat(null);
      
      setContextMenu(null);
      setSwipedConversation(null);
      setSwipeOffset(0);

      // Cazul special: user_chats (conversații între utilizatori)
      if (conversationKey.startsWith('user-chat-')) {
        try {
          // Salvează în user_settings pentru persistență
          const { data: existingSettings } = await supabase
            .from('user_settings')
            .select('data')
            .eq('user_id', currentUserId)
            .eq('category', 'hidden_user_chats')
            .maybeSingle();

          const hiddenList = existingSettings?.data?.conversations || [];
          if (!hiddenList.includes(conversationKey)) {
            const updatedList = [...hiddenList, conversationKey];
            
            const { error: settingsError } = await supabase
              .from('user_settings')
              .upsert({
                user_id: currentUserId,
                category: 'hidden_user_chats',
                data: { conversations: updatedList },
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,category'
              });

            if (settingsError) {
              console.error('Error saving hidden user chat:', settingsError);
            }
          }
        } catch (error) {
          console.error('Error saving hidden user chat:', error);
        }
        
        showNotificationRef.current.show('error', 'Succes', 'Conversația a fost ștearsă');
        return;
      }

      // Dacă nu există chatId, salvează în user_settings (pentru conversații fără mesaje)
      if (!chatId) {
        try {
          // Extrage productId și buyerId/sellerId din conversationKey
          const parts = conversationKey.split('-');
          if (parts.length >= 2) {
            // Salvează în user_settings pentru persistență
            const { data: existingSettings } = await supabase
              .from('user_settings')
              .select('data')
              .eq('user_id', currentUserId)
              .eq('category', 'hidden_conversations_no_chat')
              .maybeSingle();

            const hiddenConversationsList = existingSettings?.data?.conversations || [];
            if (!hiddenConversationsList.includes(conversationKey)) {
              const updatedList = [...hiddenConversationsList, conversationKey];
              
              const { error: settingsError } = await supabase
                .from('user_settings')
                .upsert({
                  user_id: currentUserId,
                  category: 'hidden_conversations_no_chat',
                  data: { conversations: updatedList },
                  updated_at: new Date().toISOString()
                });

              if (settingsError) {
                console.error('Error saving hidden conversation without chat:', settingsError);
              }
            }
          }
        } catch (error) {
          console.error('Error saving hidden conversation without chat:', error);
        }
        
        showNotificationRef.current.show('error', 'Succes', 'Conversația a fost ștearsă');
        return;
      }

      // Dacă există chatId, marchează ca hidden în baza de date
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Eroare', 'Sesiunea a expirat. Te rugăm să te autentifici din nou.');
        return;
      }

      const response = await dashboardApiFetch('/api/product-chat/hide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: chatId,
          userId: currentUserId,
        }),
      });

      if (!response.ok) {
        let errorData: any = { error: 'Eroare necunoscută' };
        const contentType = response.headers.get('content-type');
        
        try {
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const errorText = await response.text();
            console.error('[hideConversation] Non-JSON error response:', errorText);
            errorData = { error: errorText || `Eroare HTTP ${response.status}` };
          }
        } catch (parseError) {
          console.error('[hideConversation] Error parsing response:', parseError);
          errorData = { error: `Eroare HTTP ${response.status}: ${response.statusText}` };
        }
        
        console.error('[hideConversation] API error:', errorData);
        showNotificationRef.current.show('error', 'Eroare', errorData.error || `Eroare la ascunderea conversației (${response.status})`);
      } else {
        // Ascunde și rapoartele asociate cu această conversație
        try {
          // Găsește toate rapoartele care au conversationId egal cu conversationKey
          const associatedReports = reportChats.filter(report => 
            report.user_reports?.conversation_id === conversationKey
          );
          
          // Ascunde fiecare raport asociat
          for (const report of associatedReports) {
            await hideReportChat(report.id);
          }
          
          if (associatedReports.length > 0) {
            console.log(`[hideConversation] Ascunse ${associatedReports.length} rapoarte asociate`);
          }
        } catch (reportError) {
          console.error('[hideConversation] Error hiding associated reports:', reportError);
        }
        
        showNotificationRef.current.show('error', 'Succes', 'Conversația a fost ștearsă');
      }
    } catch (error: any) {
      console.error('[hideConversation] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', `Eroare la ascunderea conversației: ${error.message || 'Eroare necunoscută'}`);
    }
  }, [currentUserId, chatIds, reportChats, hideReportChat, setSelectedConversation, setSelectedReportChat]);

  // Închide context menu când se face click în altă parte
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);
  
  // Funcții pentru drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, uniqueKey: string) => {
    setDraggedKey(uniqueKey);
    e.dataTransfer.effectAllowed = 'move';
    // Adaugă un opacity mai mic pentru elementul care este tras
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);
  
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Resetează opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedKey(null);
    setDraggedOverKey(null);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent, uniqueKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedKey && draggedKey !== uniqueKey && pinnedConversations.includes(uniqueKey)) {
      setDraggedOverKey(uniqueKey);
    }
  }, [draggedKey, pinnedConversations]);
  
  const handleDrop = useCallback((e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedKey || draggedKey === targetKey || !pinnedConversations.includes(draggedKey) || !pinnedConversations.includes(targetKey)) {
      setDraggedKey(null);
      setDraggedOverKey(null);
      return;
    }
    
    // Reordonează array-ul
    const newOrder = [...pinnedConversations];
    const draggedIndex = newOrder.indexOf(draggedKey);
    const targetIndex = newOrder.indexOf(targetKey);
    
    // Elimină elementul de la poziția inițială
    newOrder.splice(draggedIndex, 1);
    // Inserează elementul la noua poziție
    newOrder.splice(targetIndex, 0, draggedKey);
    
    setPinnedConversations(newOrder);
    
    // Salvează în Supabase
    if (currentUserId) {
      (async () => {
        try {
          const { error } = await supabase
            .from('user_settings')
            .upsert({
              user_id: currentUserId,
              category: 'pinned_conversations',
              data: { conversations: newOrder },
              updated_at: new Date().toISOString()
            });

          if (error) {
            console.error('Error saving pinned conversations order:', error);
          }
        } catch (error) {
          console.error('Error saving pinned conversations order:', error);
        }
      })();
    }
    
    setDraggedKey(null);
    setDraggedOverKey(null);
  }, [draggedKey, pinnedConversations, currentUserId]);
  
  // Funcție helper pentru apelul direct
  const showNotification = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    showNotificationRef.current.show(type, title, message);
  };
  
  // Încarcă mesajele din chat pentru conversația selectată
  const loadChatMessages = useCallback(async (productId: string, sellerId: string, buyerId?: string) => {
    if (!currentUserId) return;

    try {
      // Determină buyerId și sellerId pentru query
      let actualBuyerId = buyerId;
      let actualSellerId = sellerId;

      // Dacă user-ul este vânzătorul produsului
      const conv = allConversations.find(c => 
        c.productId === productId && 
        c.sellerId === sellerId &&
        c.buyerId === buyerId // Include buyerId pentru identificare unică
      );
      if (conv?.buyerId) {
        // Received bid - user este seller, buyer este buyerId
        actualBuyerId = conv.buyerId;
        actualSellerId = currentUserId;
      } else {
        // Made bid - user este buyer, seller este sellerId
        actualBuyerId = currentUserId;
        actualSellerId = sellerId;
      }

      const params = new URLSearchParams({
        productId: productId,
        buyerId: actualBuyerId || currentUserId,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await dashboardApiFetch(`/api/product-chat/messages?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      const conversationKey = buyerId 
        ? `${productId}-${buyerId}`
        : `${productId}-${sellerId}`;

      if (data.chat) {
        setChatIds(prev => ({
          ...prev,
          [conversationKey]: data.chat.id
        }));
        
        // Încarcă starea de blocare din metadata chat-ului
        const metadata = data.chat.metadata || {};
        const blockedBySeller = metadata.blocked_by_seller === true;
        const blockedByBuyer = metadata.blocked_by_buyer === true;
        
        setBlockedChats(prev => ({
          ...prev,
          [conversationKey]: {
            blocked_by_seller: blockedBySeller,
            blocked_by_buyer: blockedByBuyer
          }
        }));
      }

      if (data.messages) {
        setChatMessages(prev => ({
          ...prev,
          [conversationKey]: data.messages || []
        }));
        
        // Încarcă reactions pentru mesaje
        if (data.messages && data.messages.length > 0) {
          loadMessageReactions(data.messages, 'product_chat');
        }
      }
    } catch (error) {
      console.error('[loadChatMessages] Error loading messages:', error);
    }
  }, [currentUserId, allConversations]);

  // Actualizează ref-urile pentru Realtime subscriptions
  useEffect(() => {
    allConversationsRef.current = allConversations;
  }, [allConversations]);

  useEffect(() => {
    loadChatMessagesRef.current = loadChatMessages;
  }, [loadChatMessages]);
  
  // Funcții pentru message reactions (WhatsApp style)
  const loadMessageReactions = useCallback(async (messages: any[], messageType: 'product_chat' | 'report_chat') => {
    if (!currentUserId || messages.length === 0) return;
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      
      const promises = messages.map(async (msg) => {
        try {
          const response = await dashboardApiFetch(`/api/messages/react?messageId=${msg.id}&messageType=${messageType}`, {
            headers: {
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            return {
              messageId: msg.id,
              reactions: data.reactions || {},
              userReactions: data.userReactions || [],
            };
          }
          return null;
        } catch (error) {
          console.error(`Error loading reactions for message ${msg.id}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      const newReactions: Record<string, { reactions: Record<string, { count: number; userIds: string[] }>; userReactions: string[] }> = {};
      
      results.forEach((result) => {
        if (result) {
          const key = `${messageType}-${result.messageId}`;
          newReactions[key] = {
            reactions: result.reactions,
            userReactions: result.userReactions,
          };
        }
      });
      
      setMessageReactions(prev => ({ ...prev, ...newReactions }));
    } catch (error) {
      console.error('[loadMessageReactions] Error:', error);
    }
  }, [currentUserId]);

  const toggleMessageReaction = useCallback(async (messageId: string, messageType: 'product_chat' | 'report_chat', emoji: string) => {
    if (!currentUserId) return;
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Eroare', 'Te rugăm să te autentifici');
        return;
      }
      
      const response = await dashboardApiFetch('/api/messages/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          messageType,
          reactionType: emoji,
        }),
      });
      
      if (response.ok) {
        // Reîncarcă reactions pentru acest mesaj
        const getResponse = await dashboardApiFetch(`/api/messages/react?messageId=${messageId}&messageType=${messageType}`, {
          headers: {
          },
        });
        
        if (getResponse.ok) {
          const reactionsData = await getResponse.json();
          const key = `${messageType}-${messageId}`;
          setMessageReactions(prev => ({
            ...prev,
            [key]: {
              reactions: reactionsData.reactions || {},
              userReactions: reactionsData.userReactions || [],
            },
          }));
        }
      }
    } catch (error) {
      console.error('[toggleMessageReaction] Error:', error);
    }
  }, [currentUserId]);

  // Funcție pentru selecție imagini
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, conversationKey: string) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showNotificationRef.current.show('error', 'Eroare', 'Te rugăm să selectezi doar imagini');
      return;
    }

    // Limitează la 5 imagini
    const currentImages = selectedImages[conversationKey] || [];
    const newImages = [...currentImages, ...imageFiles].slice(0, 5);
    
    setSelectedImages(prev => ({
      ...prev,
      [conversationKey]: newImages
    }));

    // Creează preview-uri
    const newPreviews: string[] = [];
    newImages.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreviews(prev => ({
          ...prev,
          [conversationKey]: [...(prev[conversationKey] || []), result].slice(0, 5)
        }));
      };
      reader.readAsDataURL(file);
    });

    // Resetează input-ul
    if (fileInputRef.current[conversationKey]) {
      fileInputRef.current[conversationKey]!.value = '';
    }
  }, [selectedImages]);

  // Funcție pentru ștergere imagine
  const handleRemoveImage = useCallback((conversationKey: string, index: number) => {
    setSelectedImages(prev => {
      const images = prev[conversationKey] || [];
      const newImages = images.filter((_, i) => i !== index);
      return {
        ...prev,
        [conversationKey]: newImages
      };
    });
    setImagePreviews(prev => {
      const previews = prev[conversationKey] || [];
      const newPreviews = previews.filter((_, i) => i !== index);
      return {
        ...prev,
        [conversationKey]: newPreviews
      };
    });
  }, []);

  // Funcție pentru upload imagini (R2 presigned + metadata Supabase)
  const uploadImages = useCallback(async (files: File[], conversationKey: string): Promise<string[]> => {
    if (files.length === 0) {
      console.warn('[uploadImages] No files to upload');
      return [];
    }

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        console.log('[uploadImages] Uploading file:', { fileName: file.name, size: file.size, type: file.type });

        const result = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });

        if (result.success && result.url) {
          uploadedUrls.push(result.url);
          console.log('[uploadImages] File uploaded successfully:', result.url);
        } else {
          console.error('[uploadImages] Upload failed:', result);
          errors.push(`${file.name}: ${(!result.success && result.error) || 'Eroare la upload'}`);
        }
      } catch (error: any) {
        console.error('[uploadImages] Error processing image:', error);
        errors.push(`${file.name}: ${error.message || 'Eroare necunoscută'}`);
      }
    }

    if (uploadedUrls.length === 0 && errors.length > 0) {
      throw new Error(`Toate imaginile au eșuat la upload: ${errors.join('; ')}`);
    }

    if (errors.length > 0 && uploadedUrls.length > 0) {
      console.warn('[uploadImages] Some images failed to upload:', errors);
    }

    console.log('[uploadImages] Upload complete:', { successful: uploadedUrls.length, failed: errors.length, total: files.length });
    return uploadedUrls;
  }, []);

  // Încarcă mesajele pentru un user_chat specific
  const loadUserChatMessages = useCallback(async (chatId: string) => {
    if (!currentUserId || !chatId) return;

    try {
      console.log('[loadUserChatMessages] Loading messages for chat:', chatId);

      const { data: messages, error } = await supabase
        .from('user_chat_messages')
        .select('id, chat_id, sender_user_id, message_text, is_system_message, metadata, created_at, read_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[loadUserChatMessages] Error:', error);
        return;
      }

      console.log('[loadUserChatMessages] Loaded', messages?.length || 0, 'messages');

      // Convertește mesajele în formatul așteptat de UI (compatibil cu product_chat_messages)
      const formattedMessages = (messages || []).map((msg: UserChatMessageRow) => ({
        id: msg.id,
        sender_user_id: msg.sender_user_id,
        message_text: msg.message_text,
        created_at: msg.created_at,
        is_read: !!msg.read_at,
        is_system_message: msg.is_system_message,
        metadata: msg.metadata
      }));

      // Salvează mesajele folosind chatId ca key
      setChatMessages(prev => ({
        ...prev,
        [`user-chat-${chatId}`]: formattedMessages
      }));

      // Marchează mesajele ca citite
      const unreadMessages = messages?.filter(
        (m: UserChatMessageRow) => !m.read_at && m.sender_user_id !== currentUserId,
      );

      if (unreadMessages && unreadMessages.length > 0) {
        await supabase
          .from('user_chat_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('chat_id', chatId)
          .is('read_at', null)
          .neq('sender_user_id', currentUserId);
      }
    } catch (error) {
      console.error('[loadUserChatMessages] Error:', error);
    }
  }, [currentUserId]);

  // Acceptă cererea de chat
  const handleAcceptChatRequest = useCallback(async (requestId: string, chatId: string) => {
    try {
      console.log('[handleAcceptChatRequest] Accepting request:', requestId);

      // Actualizează status-ul cererii în chat_requests
      const { error } = await supabase
        .from('chat_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (error) {
        console.error('[handleAcceptChatRequest] Error:', error);
        showNotificationRef.current.show('error', 'Eroare', 'Eroare la acceptarea cererii');
        return;
      }

      // Reîncarcă mesajele pentru a actualiza UI
      await loadUserChatMessages(chatId);
      showNotificationRef.current.show('success', 'Success', 'Cerere acceptată cu succes!');
    } catch (error) {
      console.error('[handleAcceptChatRequest] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la acceptarea cererii');
    }
  }, [loadUserChatMessages]);

  // Refuză cererea de chat
  const handleRefuseChatRequest = useCallback(async (requestId: string, chatId: string) => {
    try {
      console.log('[handleRefuseChatRequest] Refusing request:', requestId);

      // Actualizează status-ul cererii în chat_requests
      const { error } = await supabase
        .from('chat_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) {
        console.error('[handleRefuseChatRequest] Error:', error);
        showNotificationRef.current.show('error', 'Eroare', 'Eroare la refuzarea cererii');
        return;
      }

      // Reîncarcă mesajele pentru a actualiza UI
      await loadUserChatMessages(chatId);
      showNotificationRef.current.show('success', 'Success', 'Cerere refuzată');
    } catch (error) {
      console.error('[handleRefuseChatRequest] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la refuzarea cererii');
    }
  }, [loadUserChatMessages]);

  // Trimite mesaj prin API (cu suport pentru imagini)
  const handleSendMessage = useCallback(async (conversationKey: string, messageText: string, images?: File[]) => {
    const hasText = messageText?.trim() || false;
    const hasImages = (images?.length || 0) > 0 || (selectedImages[conversationKey]?.length || 0) > 0;
    
    if ((!hasText && !hasImages) || !currentUserId) {
      console.log('[handleSendMessage] Early return:', { hasText, hasImages, hasUserId: !!currentUserId });
      return;
    }

    // Verifică dacă utilizatorul curent a blocat celălalt utilizator sau este blocat de acesta
    const conv = allConversations.find(c => {
      const keyForConv = c.buyerId 
        ? `${c.productId}-${c.buyerId}`
        : `${c.productId}-${c.sellerId}`;
      return keyForConv === conversationKey;
    });

    // **FLOW SEPARAT PENTRU USER_CHATS**
    if (conv?.type === 'user' && conv.userChatId) {
      console.log('[handleSendMessage] Sending message in user_chat:', conv.userChatId);
      
      // Verificare blocare
      if (conv.otherUserId) {
        if (blockedUsers.has(conv.otherUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Nu poți trimite mesaje către un utilizator pe care l-ai blocat.');
          return;
        }
        if (usersBlockedMe.has(conv.otherUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți trimite mesaje.');
          return;
        }
      }

      const userChatKey = `user-chat-${conv.userChatId}`;
      const optIdUser = `opt-${Date.now()}`;
      setChatMessages(prev => ({
        ...prev,
        [userChatKey]: [...(prev[userChatKey] || []), {
          id: optIdUser,
          sender_user_id: currentUserId,
          message_text: messageText.trim(),
          created_at: new Date().toISOString(),
          is_read: false
        }]
      }));
      setNewCounterOfferAmount(prev => { const n = { ...prev }; delete n[conversationKey]; return n; });
      setSelectedImages(prev => { const n = { ...prev }; delete n[conversationKey]; return n; });

      try {
        const { error } = await supabase
          .from('user_chat_messages')
          .insert({
            chat_id: conv.userChatId,
            sender_user_id: currentUserId,
            message_text: messageText.trim(),
            is_system_message: false
          });

        if (error) {
          setChatMessages(prev => ({
            ...prev,
            [userChatKey]: (prev[userChatKey] || []).filter(m => m.id !== optIdUser)
          }));
          console.error('[handleSendMessage] Error sending user chat message:', error);
          showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea mesajului');
          return;
        }

        await loadUserChatMessages(conv.userChatId);
        console.log('[handleSendMessage] User chat message sent successfully');
        return;
      } catch (error) {
        setChatMessages(prev => ({
          ...prev,
          [userChatKey]: (prev[userChatKey] || []).filter(m => m.id !== optIdUser)
        }));
        console.error('[handleSendMessage] Error:', error);
        showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea mesajului');
        return;
      }
    }
    // **END USER_CHATS FLOW**

    if (conv) {
      const targetUserId = conv.buyerId && conv.buyerId !== currentUserId
        ? conv.buyerId
        : conv.sellerId && conv.sellerId !== currentUserId
          ? conv.sellerId
          : null;

      if (targetUserId) {
        if (blockedUsers.has(targetUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Nu poți trimite mesaje către un utilizator pe care l-ai blocat.');
          return;
        }
        if (usersBlockedMe.has(targetUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți trimite mesaje.');
          return;
        }
      }
    }

    try {
      console.log('[handleSendMessage] Starting to send message:', { conversationKey, messageText: messageText.substring(0, 50) });
      
      // Parsează conversationKey - format: productId-otherId
      // UUID-urile au format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 caractere cu 4 '-')
      // Split după primul UUID complet (36 caractere + 1 '-')
      const uuidRegex = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/i;
      const match = conversationKey.match(uuidRegex);
      
      if (!match) {
        console.error('[handleSendMessage] Invalid conversationKey format:', conversationKey);
        showNotificationRef.current.show('error', 'Eroare', 'Format de conversație invalid');
        return;
      }
      
      const productId = match[1];
      const otherId = match[2];
      
      console.log('[handleSendMessage] Parsed keys:', { productId, otherId, fullKey: conversationKey });
      
      // Caută conversația folosind logica corectă
      const conv = allConversations.find(c => {
        const keyForConv = c.buyerId 
          ? `${c.productId}-${c.buyerId}` // Received bids: productId-buyerId
          : `${c.productId}-${c.sellerId}`; // Made bids: productId-sellerId
        return keyForConv === conversationKey;
      });

      if (!conv) {
        console.error('[handleSendMessage] Conversation not found:', { 
          conversationKey, 
          productId, 
          otherId,
          availableConversations: allConversations.map(c => ({
            productId: c.productId,
            sellerId: c.sellerId,
            buyerId: c.buyerId,
            key: c.buyerId ? `${c.productId}-${c.buyerId}` : `${c.productId}-${c.sellerId}`
          }))
        });
        showNotificationRef.current.show('error', 'Eroare', 'Conversația nu a fost găsită');
        return;
      }

      let actualBuyerId: string;
      let actualSellerId: string;

      if (conv.buyerId) {
        // Received bid - user este seller
        actualBuyerId = conv.buyerId;
        actualSellerId = currentUserId;
      } else {
        // Made bid - user este buyer
        actualBuyerId = currentUserId;
        actualSellerId = conv.sellerId;
      }

      const chatId = chatIds[conversationKey];
      console.log('[handleSendMessage] Calculated IDs:', { productId, actualBuyerId, actualSellerId, hasChatId: !!chatId });

      // Re-verificare blocare (în cazul în care conv nu a fost găsită mai sus)
      const targetUserId = actualBuyerId !== currentUserId ? actualBuyerId : actualSellerId;
      if (targetUserId) {
        if (blockedUsers.has(targetUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Nu poți trimite mesaje către un utilizator pe care l-ai blocat.');
          return;
        }
        if (usersBlockedMe.has(targetUserId)) {
          showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți trimite mesaje.');
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[handleSendMessage] No session found');
        return;
      }

      // Upload imagini dacă există (înainte de trimiterea mesajului)
      const filesToUpload = images || selectedImages[conversationKey] || [];
      let imageUrls: string[] = [];
      
      console.log('[handleSendMessage] Files to upload:', { 
        filesCount: filesToUpload.length, 
        conversationKey,
        hasImagesParam: !!images,
        hasSelectedImages: !!selectedImages[conversationKey],
        selectedImagesCount: selectedImages[conversationKey]?.length || 0
      });
      
      if (filesToUpload.length > 0) {
        try {
          imageUrls = await uploadImages(filesToUpload, conversationKey);
          console.log('[handleSendMessage] Uploaded images:', { count: imageUrls.length, urls: imageUrls });
        } catch (uploadError: any) {
          console.error('[handleSendMessage] Image upload error:', uploadError);
          showNotificationRef.current.show('error', 'Eroare', uploadError?.message || 'Eroare la încărcarea imaginilor');
          return;
        }
      }

      // Dacă există imagini, le include în mesaj
      let finalMessageText = (messageText || '').trim();
      if (imageUrls.length > 0) {
        const imageLinks = imageUrls.map(url => `[IMAGE:${url}]`).join(' ');
        finalMessageText = finalMessageText ? `${finalMessageText}\n${imageLinks}` : imageLinks;
      }

      console.log('[handleSendMessage] Final message text:', { 
        hasText: !!finalMessageText, 
        length: finalMessageText?.length || 0,
        preview: finalMessageText?.substring(0, 100)
      });

      // Verificare finală: trebuie să existe fie text, fie imagini
      if (!finalMessageText || finalMessageText.trim().length === 0) {
        console.error('[handleSendMessage] No message text or images after processing', {
          originalMessageText: messageText,
          hasImagesToUpload: filesToUpload.length > 0,
          uploadedImageUrls: imageUrls.length,
          finalMessageText
        });
        showNotificationRef.current.show('error', 'Eroare', 'Mesajul nu poate fi gol. Verifică că imaginile au fost încărcate corect.');
        return;
      }

      const requestBody: any = {
        productId: productId,
        buyerId: actualBuyerId,
        messageText: finalMessageText,
      };
      
      // Adaugă chatId doar dacă există
      if (chatId) {
        requestBody.chatId = chatId;
      }

      console.log('[handleSendMessage] Sending request to API:', { ...requestBody, messageText: '[hidden]' });

      let optId: string = `opt-${Date.now()}`;
      setChatMessages(prev => ({
        ...prev,
        [conversationKey]: [...(prev[conversationKey] || []), {
          id: optId,
          sender_user_id: currentUserId,
          message_text: finalMessageText,
          created_at: new Date().toISOString(),
          is_read: false
        }]
      }));
      setNewCounterOfferAmount(prev => { const n = { ...prev }; delete n[conversationKey]; return n; });
      setSelectedImages(prev => { const n = { ...prev }; delete n[conversationKey]; return n; });
      setImagePreviews(prev => { const n = { ...prev }; delete n[conversationKey]; return n; });

      const response = await dashboardApiFetch('/api/product-chat/messages', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[handleSendMessage] API response status:', response.status);

      if (!response.ok) {
        setChatMessages(prev => ({
          ...prev,
          [conversationKey]: (prev[conversationKey] || []).filter(m => m.id !== optId)
        }));
        let errorData: any = { error: 'Unknown error' };
        try {
          const responseText = await response.text();
          console.error('[handleSendMessage] API error response text:', responseText);
          if (responseText) {
            try {
              errorData = JSON.parse(responseText);
            } catch (parseError) {
              errorData = { error: responseText || 'Eroare necunoscută' };
            }
          }
        } catch (textError) {
          console.error('[handleSendMessage] Error reading error response:', textError);
        }
        console.error('[handleSendMessage] API error:', errorData, { status: response.status, statusText: response.statusText });
        showNotificationRef.current.show('error', 'Eroare', errorData.error || errorData.details || 'Eroare la trimiterea mesajului');
        return;
      }

      const data = await response.json();
      console.log('[handleSendMessage] Message sent successfully:', { messageId: data.message?.id, chatId: data.chat?.id });
      
      if (data.chat?.id && !chatId) {
        setChatIds(prev => ({
          ...prev,
          [conversationKey]: data.chat.id
        }));
      }
      
      await loadChatMessages(productId, actualSellerId, actualBuyerId);
    } catch (error: any) {
      setChatMessages(prev => ({
        ...prev,
        [conversationKey]: (prev[conversationKey] || []).filter(m => !String(m.id).startsWith('opt-'))
      }));
      console.error('[handleSendMessage] Error sending message:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea mesajului: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [currentUserId, allConversations, chatIds, loadChatMessages, selectedImages, uploadImages]);

  // Funcție pentru blocare/deblocare chat
  const handleToggleChatBlock = useCallback(async (conversationKey: string) => {
    console.log('[handleToggleChatBlock] Called with:', { conversationKey, currentUserId, chatIds: Object.keys(chatIds) });
    
    if (!currentUserId) {
      console.log('[handleToggleChatBlock] No currentUserId');
      return;
    }

    try {
      // Determină dacă utilizatorul curent este seller sau buyer (trebuie găsit înainte)
      const conv = allConversations.find(c => {
        const keyForConv = c.buyerId 
          ? `${c.productId}-${c.buyerId}`
          : `${c.productId}-${c.sellerId}`;
        return keyForConv === conversationKey;
      });

      if (!conv) {
        console.error('[handleToggleChatBlock] Conversation not found:', conversationKey);
        showNotificationRef.current.show('error', 'Eroare', 'Conversația nu a fost găsită');
        return;
      }

      // Determină buyerId și sellerId pentru query
      let actualBuyerId: string;
      let actualSellerId: string;

      if (conv.buyerId) {
        // Received bid - user este seller
        actualBuyerId = conv.buyerId;
        actualSellerId = currentUserId;
      } else {
        // Made bid - user este buyer
        actualBuyerId = currentUserId;
        actualSellerId = conv.sellerId;
      }

      // Verifică sau obține chat-ul (chiar dacă chatId există în state, îl verificăm/creăm pentru a ne asigura că există)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[handleToggleChatBlock] No session found');
        showNotificationRef.current.show('error', 'Eroare', 'Nu sunteți autentificat. Vă rugăm să vă conectați din nou.');
        return;
      }

      let chatId = chatIds[conversationKey];
      console.log('[handleToggleChatBlock] Initial Chat ID from state:', chatId);

      // Obține sau creează chat-ul prin API (chiar dacă există în state, verificăm că există în DB)
      const params = new URLSearchParams({
        productId: conv.productId,
        buyerId: actualBuyerId,
      });

      // Dacă există chatId în state, îl folosim în query pentru verificare
      if (chatId) {
        params.append('chatId', chatId);
      }

      const chatResponse = await dashboardApiFetch(`/api/product-chat/messages?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Unknown error' };
        }
        console.error('[handleToggleChatBlock] Failed to get/create chat:', { 
          status: chatResponse.status, 
          statusText: chatResponse.statusText,
          error: errorData 
        });
        showNotificationRef.current.show('error', 'Eroare', 'Nu s-a putut obține sau crea chat-ul. Vă rugăm să reîncercați.');
        return;
      }

      const data = await chatResponse.json();
      if (!data.chat?.id) {
        console.error('[handleToggleChatBlock] No chat ID in API response');
        showNotificationRef.current.show('error', 'Eroare', 'Nu s-a putut obține chat-ul. Vă rugăm să reîncercați.');
        return;
      }

      chatId = data.chat.id;
      console.log('[handleToggleChatBlock] Chat ID obtained/verified:', {
        chatId,
        chatIdType: typeof chatId,
        chatIdLength: chatId?.length,
        fullChatData: data.chat
      });
      
      // Actualizează chatIds state
      setChatIds(prev => ({
        ...prev,
        [conversationKey]: chatId
      }));

      // Folosește metadata din chat-ul obținut (sursa de adevăr)
      const currentBlockState = data.chat.metadata 
        ? {
            blocked_by_seller: data.chat.metadata.blocked_by_seller === true,
            blocked_by_buyer: data.chat.metadata.blocked_by_buyer === true
          }
        : { blocked_by_seller: false, blocked_by_buyer: false };

      console.log('[handleToggleChatBlock] Current block state from chat:', currentBlockState);

      // Actualizează blockedChats cu metadata obținută
      setBlockedChats(prev => ({
        ...prev,
        [conversationKey]: currentBlockState
      }));

      const isSeller = conv.product.user_id === currentUserId;
      console.log('[handleToggleChatBlock] User role:', { isSeller, currentUserId, productUserId: conv.product.user_id });
      
      // Toggle blocarea pentru utilizatorul curent
      const newBlockState = {
        blocked_by_seller: isSeller ? !currentBlockState.blocked_by_seller : currentBlockState.blocked_by_seller,
        blocked_by_buyer: !isSeller ? !currentBlockState.blocked_by_buyer : currentBlockState.blocked_by_buyer
      };

      console.log('[handleToggleChatBlock] New block state to apply:', newBlockState);

      // Mică întârziere pentru a ne asigura că chat-ul este salvat în baza de date (dacă tocmai a fost creat)
      if (!chatIds[conversationKey]) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Actualizează metadata în backend (sessionData este deja disponibil din codul de mai sus)
      console.log('[handleToggleChatBlock] Sending metadata update request:', {
        chatId,
        metadata: newBlockState,
        sessionExists: !!sessionData.session
      });

      const metadataResponse = await dashboardApiFetch('/api/product-chat/update-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: chatId,
          metadata: {
            blocked_by_seller: newBlockState.blocked_by_seller,
            blocked_by_buyer: newBlockState.blocked_by_buyer
          }
        }),
      });

      let finalMetadataResponse = metadataResponse;
      let finalUpdateResult: any;

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        console.log('[handleToggleChatBlock] Error response details:', {
          status: metadataResponse.status,
          statusText: metadataResponse.statusText,
          errorText: errorText,
          errorTextLength: errorText?.length,
          chatId: chatId
        });
        
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Unknown error', parseError: e };
        }
        console.error('[handleToggleChatBlock] Failed to update metadata:', { 
          status: metadataResponse.status, 
          statusText: metadataResponse.statusText,
          error: errorData,
          errorText: errorText,
          chatId,
          chatIdType: typeof chatId
        });
        
        // Dacă este 404, înseamnă că chat-ul nu există - reîncearcă după o mică pauză
        if (metadataResponse.status === 404) {
          console.log('[handleToggleChatBlock] Status is 404, starting retry logic...');
          console.log('[handleToggleChatBlock] Chat not found (404), retrying after delay...');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Reîncearcă să obțină chat-ul
          const retryParams = new URLSearchParams({
            productId: conv.productId,
            buyerId: actualBuyerId,
          });
          
          const retryResponse = await dashboardApiFetch(`/api/product-chat/messages?${retryParams.toString()}`,
            {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            if (retryData.chat?.id) {
              chatId = retryData.chat.id;
              console.log('[handleToggleChatBlock] Retry successful, new chatId:', chatId);
              
              // Reîncearcă update-ul metadata
              finalMetadataResponse = await dashboardApiFetch('/api/product-chat/update-metadata', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chatId: chatId,
                  metadata: {
                    blocked_by_seller: newBlockState.blocked_by_seller,
                    blocked_by_buyer: newBlockState.blocked_by_buyer
                  }
                }),
              });
              
              if (!finalMetadataResponse.ok) {
                const retryErrorText = await finalMetadataResponse.text();
                let retryErrorData: any = {};
                try {
                  retryErrorData = JSON.parse(retryErrorText);
                } catch (e) {
                  retryErrorData = { error: retryErrorText || 'Unknown error' };
                }
                console.error('[handleToggleChatBlock] Retry also failed:', retryErrorData);
                showNotificationRef.current.show('error', 'Eroare', `Eroare la actualizarea chat-ului: ${retryErrorData.error || retryErrorData.details || 'Eroare necunoscută'}`);
                return;
              }
              
              finalUpdateResult = await finalMetadataResponse.json();
              console.log('[handleToggleChatBlock] Retry metadata update successful:', finalUpdateResult);
              // Continuă cu trimiterea mesajului automat după retry reușit
            } else {
              showNotificationRef.current.show('error', 'Eroare', 'Nu s-a putut obține chat-ul. Vă rugăm să reîncercați.');
              return;
            }
          } else {
            showNotificationRef.current.show('error', 'Eroare', 'Chat-ul nu există. Vă rugăm să reîncercați.');
            return;
          }
        } else {
          showNotificationRef.current.show('error', 'Eroare', `Eroare la actualizarea chat-ului: ${errorData.error || errorData.details || 'Eroare necunoscută'}`);
          return;
        }
      } else {
        finalUpdateResult = await metadataResponse.json();
        console.log('[handleToggleChatBlock] Metadata updated successfully:', finalUpdateResult);
      }

      // Asigură-te că avem un update result înainte de a continua
      if (!finalUpdateResult) {
        console.error('[handleToggleChatBlock] No update result available, cannot continue');
        showNotificationRef.current.show('error', 'Eroare', 'Eroare la actualizarea metadata. Vă rugăm să reîncercați.');
        return;
      }

      console.log('[handleToggleChatBlock] Continuing with state update and system message...');

      // Actualizează state-ul local
      setBlockedChats(prev => ({
        ...prev,
        [conversationKey]: newBlockState
      }));

      // Trimite mesaj automat
      const isBlocking = isSeller ? newBlockState.blocked_by_seller : newBlockState.blocked_by_buyer;
      const userName = isSeller ? 'Vânzătorul' : 'Cumpărătorul';
      const messageText = isBlocking
        ? `GoBid mesaj automat: ${userName} a ales să comunice doar prin oferte și contraoferte până când se ajunge la un consens. Vă rugăm să folosiți butonul de oferte/contraoferte pentru a negocia profesional.`
        : `GoBid mesaj automat: Deoarece s-a ajuns la un consens, chat-ul este deblocat pentru comunicare.`;

      console.log('[handleToggleChatBlock] Sending system message:', { chatId, messageText, sessionExists: !!sessionData.session });

      // Trimite mesaj automat prin API (folosind is_system_message)
      try {
        const systemMessageResponse = await dashboardApiFetch('/api/product-chat/system-message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: chatId,
            messageText: messageText
          }),
        });

        console.log('[handleToggleChatBlock] System message response status:', systemMessageResponse.status, systemMessageResponse.statusText);

        if (!systemMessageResponse.ok) {
          const errorText = await systemMessageResponse.text();
          console.log('[handleToggleChatBlock] System message error text:', errorText);
          
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText || 'Unknown error', parseError: e };
          }
          console.error('[handleToggleChatBlock] Failed to send system message:', { 
            status: systemMessageResponse.status, 
            statusText: systemMessageResponse.statusText,
            error: errorData,
            errorText: errorText,
            chatId: chatId
          });
          
          // Încearcă să trimită mesajul automat din nou după o mică pauză
          console.log('[handleToggleChatBlock] Retrying system message after delay...');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          try {
            const retrySystemMessageResponse = await dashboardApiFetch('/api/product-chat/system-message', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId: chatId,
                messageText: messageText
              }),
            });
            
            if (retrySystemMessageResponse.ok) {
              const retrySystemMessageResult = await retrySystemMessageResponse.json();
              console.log('[handleToggleChatBlock] Retry system message successful:', retrySystemMessageResult);
            } else {
              const retryErrorText = await retrySystemMessageResponse.text();
              console.error('[handleToggleChatBlock] Retry system message also failed:', {
                status: retrySystemMessageResponse.status,
                errorText: retryErrorText
              });
            }
          } catch (retryError: any) {
            console.error('[handleToggleChatBlock] Retry system message exception:', retryError);
          }
        } else {
          const systemMessageResult = await systemMessageResponse.json();
          console.log('[handleToggleChatBlock] System message sent successfully:', systemMessageResult);
        }
      } catch (fetchError: any) {
        console.error('[handleToggleChatBlock] Exception while sending system message:', {
          error: fetchError,
          message: fetchError?.message,
          stack: fetchError?.stack
        });
      }

      // Reîncarcă mesajele pentru a include mesajul automat
      console.log('[handleToggleChatBlock] Reloading chat messages...');
      await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
    } catch (error: any) {
      console.error('[handleToggleChatBlock] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la blocarea/deblocarea chat-ului: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [currentUserId, chatIds, allConversations, blockedChats, loadChatMessages, showNotificationRef]);

  // Load dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Închide tooltip-ul de privacy mode când se face click în exterior (doar pe mobil)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Nu închide dacă click-ul este pe butonul de lock (acela gestionează toggle-ul manual)
      if (!target.closest('button[type="button"]') || !target.closest('.relative.group')) {
        if (window.innerWidth < 768) {
          setShowPrivacyModeTooltip(null);
        }
      }
    };

    if (showPrivacyModeTooltip && window.innerWidth < 768) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPrivacyModeTooltip]);

  // Închide meniul mobil când se face click în exterior
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const menuButton = target.closest('[aria-label="Meniu"]');
      const menuContainer = target.closest('.mobile-menu-container');
      
      if (!menuButton && !menuContainer) {
        if (window.innerWidth < 768) {
          setShowMobileMenu(false);
        }
      }
    };

    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMobileMenu]);

  // Funcție pentru blocare/deblocare utilizator
  const handleBlockUser = useCallback(async (targetUserId: string, block: boolean, conversationKey: string, chatId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await dashboardApiFetch('/api/user/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blockedUserId: targetUserId,
          block: block
        }),
      });

      if (!response.ok) {
        let errorMessage = `Nu s-a putut bloca/debloca utilizatorul (Status: ${response.status || 'unknown'})`;
        try {
          const errorText = await response.text();
          if (errorText && typeof errorText === 'string' && errorText.trim().length > 0) {
            try {
              const errorData = JSON.parse(errorText);
              if (errorData && typeof errorData === 'object' && errorData !== null) {
                const apiError = errorData.error || errorData.message || null;
                if (apiError && typeof apiError === 'string') {
                  errorMessage = apiError;
                } else if (apiError && typeof apiError === 'object' && 'message' in apiError) {
                  errorMessage = String(apiError.message || errorMessage);
                }
              }
            } catch (parseErr) {
              // Dacă nu e JSON valid, folosește text-ul direct
              if (errorText.length < 500) {
                errorMessage = errorText;
              }
            }
          }
        } catch (textError) {
          // Ignorăm erorile de citire, folosim mesajul default
        }
        
        // Mesaj final sigur
        const safeErrorMessage = String(errorMessage || 'Eroare necunoscută la blocare/deblocare utilizator');
        
        // În loc să aruncăm o eroare, afișăm direct notificarea și returnăm
        if (showNotificationRef.current) {
          showNotificationRef.current.show('error', 'Eroare', safeErrorMessage);
        }
        setShowMobileMenu(false);
        return;
      }

      // Actualizează state-ul local
      setBlockedUsers(prev => {
        const newSet = new Set(prev);
        if (block) {
          newSet.add(targetUserId);
        } else {
          newSet.delete(targetUserId);
        }
        return newSet;
      });

      // Obține username-ul utilizatorului blocat
      const { data: blockedUserProfile } = await supabase
        .from('user_profiles')
        .select('username, first_name, last_name, email')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const blockedUserName = blockedUserProfile?.username 
        || (blockedUserProfile?.first_name && blockedUserProfile?.last_name
          ? `${blockedUserProfile.first_name} ${blockedUserProfile.last_name}`
          : blockedUserProfile?.first_name 
          || blockedUserProfile?.email 
          || targetUserId);

      // Obține username-ul utilizatorului care blochează
      const { data: currentUserProfile } = await supabase
        .from('user_profiles')
        .select('username, first_name, last_name, email')
        .eq('user_id', currentUserId)
        .maybeSingle();

      const currentUserName = currentUserProfile?.username 
        || (currentUserProfile?.first_name && currentUserProfile?.last_name
          ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
          : currentUserProfile?.first_name 
          || currentUserProfile?.email 
          || currentUserId);

      // Trimite două mesaje sistem diferite - unul pentru fiecare utilizator
      if (chatId) {
        try {
          // Mesaj pentru utilizatorul care blochează
          const messageForBlocker = block
            ? `GoBid mesaj automat: Ai blocat utilizatorul ${blockedUserName}. Utilizatorul blocat nu mai poate trimite mesaje sau plasa oferte în această conversație.`
            : `GoBid mesaj automat: Ai deblocat utilizatorul ${blockedUserName}. Utilizatorul poate din nou trimite mesaje și plasa oferte în această conversație.`;

          // Mesaj pentru utilizatorul blocat
          const messageForBlocked = block
            ? `GoBid mesaj automat: Ai fost blocat de ${currentUserName}. Nu mai poți trimite mesaje sau plasa oferte în această conversație.`
            : `GoBid mesaj automat: Ai fost deblocat de ${currentUserName}. Poți din nou trimite mesaje și plasa oferte în această conversație.`;

          // Folosim un format special în mesaj pentru a permite UI-ului să afișeze mesajul corect
          // Format: [BLOCK_MSG:userIdForBlocker:userIdForBlocked] mesaj_blocator | mesaj_blocat
          const combinedMessage = `[BLOCK_MSG:${currentUserId}:${targetUserId}]${messageForBlocker}|${messageForBlocked}`;

          // Trimite un singur mesaj sistem care conține ambele mesaje
          await dashboardApiFetch('/api/product-chat/system-message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chatId: chatId,
              messageText: combinedMessage
            }),
          });
          
          // Reîncarcă mesajele pentru a afișa mesajul sistem în chat
          const conv = allConversations.find(c => {
            const keyForConv = c.buyerId 
              ? `${c.productId}-${c.buyerId}`
              : `${c.productId}-${c.sellerId}`;
            return keyForConv === conversationKey;
          });
          
          if (conv) {
            await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
          }
        } catch (msgError) {
          console.error('[handleBlockUser] Error sending system message:', msgError);
        }
      }

      setShowMobileMenu(false);
    } catch (error: any) {
      console.error('[handleBlockUser] Error:', error);
      let errorMessage = 'A apărut o eroare la blocare/deblocare utilizator.';
      if (error) {
        if (typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message) || errorMessage;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          try {
            errorMessage = String(error) || errorMessage;
          } catch {
            // Fallback la mesajul default
          }
        }
      }
      if (showNotificationRef.current) {
        showNotificationRef.current.show('error', 'Eroare', errorMessage);
      }
    }
  }, [currentUserId, allConversations, loadChatMessages]);

  // Check authentication
  useEffect(() => {
    let cancelled = false;
    let profileRefreshInterval: ReturnType<typeof setInterval> | null = null;

    const checkAuth = async () => {
      try {
        const [{ data: sessionData }, { data: userData }] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ]);
        const user = userData.user ?? sessionData.session?.user ?? null;
        const userId = user?.id;

        if (!userId) {
          const storedUserInfo = typeof window !== 'undefined' ? localStorage.getItem('userInfo') : null;
          const storedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
          if (storedUserInfo) {
            try {
              const parsed = JSON.parse(storedUserInfo) as Record<string, unknown>;
              const fallbackUserId =
                (storedSupabaseUserId && looksLikeSupabaseUserId(storedSupabaseUserId)
                  ? storedSupabaseUserId
                  : null) ||
                (looksLikeSupabaseUserId(parsed.supabaseUserId) ? String(parsed.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(parsed.userId) ? String(parsed.userId) : null) ||
                (looksLikeSupabaseUserId(parsed.id) ? String(parsed.id) : null);
              if (fallbackUserId) {
                if (!cancelled) setCurrentUserId(fallbackUserId);
                return;
              }
            } catch {
              /* ignore */
            }
          }
          if (hasDashboardLocalAuthEvidence()) {
            return;
          }
          router.push('/auth?mode=login');
          return;
        }

        if (!cancelled) setCurrentUserId(userId);
        
        // Încarcă profilul utilizatorului curent
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, avatar_url, is_admin')
          .eq('user_id', userId)
          .maybeSingle();
        
        const loadUserProfile = async () => {
          if (profile) {
            // Avatar URL - dacă nu este URL complet, încearcă să-l transforme
            let avatarUrl = profile.avatar_url;
            if (avatarUrl && !avatarUrl.startsWith('http')) {
              // Încearcă să obțină URL-ul public din Supabase Storage
              try {
                const { data: avatarData } = supabase.storage
                  .from('avatars')
                  .getPublicUrl(avatarUrl);
                if (avatarData?.publicUrl) {
                  avatarUrl = avatarData.publicUrl;
                }
              } catch (storageError) {
                console.warn('[Avatar] Could not get storage URL, using original:', avatarUrl);
              }
            }
            
            if (!cancelled) {
              setCurrentUserProfile({
                first_name: profile.first_name || undefined,
                last_name: profile.last_name || undefined,
                username: undefined,
                email: user.email || undefined,
                avatar_url: avatarUrl || undefined,
              });
            }
          } else {
            // Fallback la email dacă nu există profil
            if (!cancelled) {
              setCurrentUserProfile({
                email: user.email || undefined,
              });
            }
          }
        };
        
        await loadUserProfile();
        
        // Reîncarcă profilul periodic pentru a actualiza avatarul (fiecare 30 secunde)
        profileRefreshInterval = setInterval(async () => {
          try {
            const { data: refreshedProfile } = await supabase
              .from('user_profiles')
              .select('first_name, last_name, avatar_url, is_admin')
              .eq('user_id', userId)
              .maybeSingle();
            
            if (refreshedProfile) {
              let avatarUrl = refreshedProfile.avatar_url;
              if (avatarUrl && !avatarUrl.startsWith('http')) {
                try {
                  const { data: avatarData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(avatarUrl);
                  if (avatarData?.publicUrl) {
                    avatarUrl = avatarData.publicUrl;
                  }
                } catch (storageError) {
                  console.warn('[Avatar] Could not get storage URL:', storageError);
                }
              }
              
              if (!cancelled) {
                setCurrentUserProfile(prev => ({
                  first_name: refreshedProfile.first_name || prev?.first_name,
                  last_name: refreshedProfile.last_name || prev?.last_name,
                  email: user?.email || prev?.email,
                  avatar_url: avatarUrl || prev?.avatar_url,
                  is_admin: refreshedProfile.is_admin || false,
                }));
              }
            }
          } catch (error) {
            console.error('[Avatar] Error refreshing profile:', error);
          }
        }, 30000);
      } catch (error) {
        console.error('Error checking auth:', error);
        if (!hasDashboardLocalAuthEvidence()) {
          router.push('/auth?mode=login');
        }
      }
    };

    void checkAuth();
    const retryTimer = setTimeout(() => { void checkAuth(); }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) void checkAuth();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (profileRefreshInterval) clearInterval(profileRefreshInterval);
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router instabil în Next → buclă infinită dacă e în deps
  }, []);

  // Încarcă chat-urile directe între utilizatori (user_chats)
  const loadUserChats = useCallback(async (): Promise<Conversation[]> => {
    if (!currentUserId) return [];

    try {
      console.log('[loadUserChats] Loading user chats for:', currentUserId);
      
      // Încarcă toate chat-urile în care utilizatorul curent este participant
      const { data: userChats, error: chatsError } = await supabase
        .from('user_chats')
        .select('id, user1_id, user2_id, created_at, updated_at, last_message_at')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false });

      if (chatsError) {
        console.error('[loadUserChats] Error loading user chats:', chatsError);
        return [];
      }

      if (!userChats || userChats.length === 0) {
        console.log('[loadUserChats] No user chats found');
        return [];
      }

      console.log('[loadUserChats] Found', userChats.length, 'user chats');

      // Determină ID-urile celorlalți utilizatori
      const otherUserIds = userChats.map((chat: UserChatRow) =>
        chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id,
      );

      // Încarcă profilurile celorlalți utilizatori
      let profilesMap: Record<string, any> = {};
      if (otherUserIds.length > 0) {
        try {
          const response = await dashboardApiFetch('/api/admin/users/profiles', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userIds: otherUserIds }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.profiles && Array.isArray(result.profiles)) {
              result.profiles.forEach((profile: any) => {
                if (profile.user_id) {
                  profilesMap[profile.user_id] = {
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    avatar_url: profile.avatar_url,
                    username: profile.username,
                    email: profile.email
                  };
                }
              });
            }
          }
        } catch (apiError) {
          console.error('[loadUserChats] Error loading profiles:', apiError);
        }
      }

      // Încarcă ultimele mesaje pentru fiecare chat
      const chatIds = userChats.map((c: UserChatRow) => c.id);
      const { data: allMessages } = await supabase
        .from('user_chat_messages')
        .select('chat_id, message_text, created_at, sender_user_id, read_at')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false });

      // Creează un map cu ultimul mesaj pentru fiecare chat
      const lastMessageMap: Record<string, any> = {};
      const unreadCountMap: Record<string, number> = {};
      
      (allMessages || []).forEach((msg: any) => {
        // Ultimul mesaj
        if (!lastMessageMap[msg.chat_id]) {
          lastMessageMap[msg.chat_id] = msg;
        }
        
        // Numără mesajele necitite (trimise de altcineva și necitite de mine)
        if (!msg.read_at && msg.sender_user_id !== currentUserId) {
          unreadCountMap[msg.chat_id] = (unreadCountMap[msg.chat_id] || 0) + 1;
        }
      });

      // Creează conversații de tip 'user' pentru fiecare chat
      const userConversations: Conversation[] = userChats.map((chat: UserChatRow) => {
        const otherUserId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id;
        const otherUserInfo = profilesMap[otherUserId] || null;
        const lastMsg = lastMessageMap[chat.id];

        // Creează un obiect Conversation compatibil (folosim câmpuri dummy pentru product)
        return {
          type: 'user',
          userChatId: chat.id,
          otherUserId: otherUserId,
          otherUserInfo: otherUserInfo,
          lastMessage: lastMsg?.message_text || '',
          lastMessageAt: chat.last_message_at || chat.created_at,
          
          // Câmpuri obligatorii pentru Conversation (NU seta productId pentru user_chats!)
          productId: undefined as any, // user_chats NU au productId
          sellerId: otherUserId,
          buyerId: undefined,
          sellerInfo: otherUserInfo,
          bids: [],
          latestBid: null,
          highestBid: 0,
          product: {
            id: undefined as any, // user_chats NU au product
            title: `Chat cu ${otherUserInfo?.first_name || otherUserInfo?.username || 'Utilizator'}`,
            description: '',
            category: '',
            subcategory: '',
            startingPrice: 0,
            currency: 'RON',
            images: [],
          }
        };
      });

      console.log('[loadUserChats] Created', userConversations.length, 'user conversations');
      
      // Actualizează unreadCounts pentru user_chats (folosind același format ca în UI)
      const newUnreadCounts: Record<string, number> = {};
      userChats.forEach((chat: UserChatRow) => {
        const otherUserId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id;
        const key = `user-chat-${chat.id}-${otherUserId}`; // Trebuie să se potrivească cu uniqueKey din UI
        newUnreadCounts[key] = unreadCountMap[chat.id] || 0;
      });
      
      // Merge cu unreadCounts existente (pentru product_chats)
      setUnreadCounts(prev => ({
        ...prev,
        ...newUnreadCounts
      }));
      
      return userConversations;
    } catch (error) {
      console.error('[loadUserChats] Error:', error);
      return [];
    }
  }, [currentUserId]);

  // Load all bids made by the current user
  const loadAllBids = useCallback(async () => {
    if (!currentUserId) return;
    
    console.log('🔄 [loadAllBids] Starting to load bids for user:', currentUserId);
    setLoadingBids(true);
    try {
      // 1. Get all bids made by the current user (as buyer)
      const { data: bidsMade, error: bidsMadeError } = await supabase
        .from('bids')
        .select('id, amount, created_at, is_winning, is_outbid, user_id, product_id')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
      
      console.log('📊 [loadAllBids] Loaded bids made:', bidsMade?.length || 0, bidsMadeError);

      if (bidsMadeError) {
        console.error('Error loading bids made:', bidsMadeError);
      }

      // 2. Get all user's products (as seller) – fără limită, paginare Supabase
      const PAGE_SIZE = 1000;
      const userProductsList: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const to = from + PAGE_SIZE - 1;
        const { data: chunk, error: productsError } = await supabase
          .from('products')
          .select('id, slug, title, description, category, subcategory, starting_price_ron, starting_price_eur, currency, images, user_id')
          .eq('user_id', currentUserId)
          .neq('status', 'deleted')
          .range(from, to);
        if (productsError) {
          console.error('Error loading user products:', productsError);
          break;
        }
        const list = chunk ?? [];
        userProductsList.push(...list);
        hasMore = list.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      const userProducts = userProductsList;

      const userProductIds = (userProducts || []).map(p => p.id);

      // 3. Get all bids received on user's products (as seller)
      let bidsReceived: any[] = [];
      if (userProductIds.length > 0) {
        const { data: bidsReceivedData, error: bidsReceivedError } = await supabase
          .from('bids')
          .select('id, amount, created_at, is_winning, is_outbid, user_id, product_id')
          .in('product_id', userProductIds)
          .order('created_at', { ascending: false });

        if (!bidsReceivedError && bidsReceivedData) {
          bidsReceived = bidsReceivedData;
        }
      }

      // Combine all bids
      const allBids = [...(bidsMade || []), ...bidsReceived];
      
      console.log('📋 [loadAllBids] Combined bids:', {
        bidsMadeCount: bidsMade?.length || 0,
        bidsReceivedCount: bidsReceived.length,
        allBidsCount: allBids.length,
        sampleBid: allBids[0]
      });

      // Încarcă conversațiile user_chats CHIAR DACĂ nu există oferte
      const userConversations = await loadUserChats();

      if (allBids.length === 0) {
        // Fără oferte: afișează conversațiile din product_chats (unde user e cumpărător, ex. "Scrie mesaj") + user_chats
        const { data: buyerChats } = await supabase
          .from('product_chats')
          .select('product_id, seller_user_id')
          .eq('buyer_user_id', currentUserId);
        const productConvs: Conversation[] = [];
        if (buyerChats && buyerChats.length > 0) {
          const pcProductIds = [...new Set(buyerChats.map((c: any) => c.product_id))];
          const { data: pcProducts } = await supabase
            .from('products')
            .select('id, slug, title, description, category, subcategory, starting_price_ron, starting_price_eur, currency, images, user_id, custom_fields')
            .in('id', pcProductIds)
            .neq('status', 'deleted');
          const productsMap0: Record<string, Product> = {};
          (pcProducts || []).forEach((row: any) => {
            productsMap0[row.id] = {
              id: row.id,
              slug: row.slug ?? undefined,
              title: row.title ?? '',
              description: row.description ?? '',
              category: row.category ?? '',
              subcategory: row.subcategory ?? '',
              startingPrice: row.starting_price_ron ?? row.starting_price_eur ?? 0,
              currency: row.currency ?? 'RON',
              images: Array.isArray(row?.images) ? row.images : [],
              user_id: row.user_id ?? undefined,
              customFields: row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
            };
          });
          const sellerIds = [...new Set(buyerChats.map((c: any) => c.seller_user_id))];
          let profilesMap0: Record<string, any> = {};
          if (sellerIds.length > 0) {
            try {
              const r = await dashboardApiFetch('/api/admin/users/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: sellerIds }),
              });
              if (r.ok) {
                const j = await r.json();
                if (j.success && Array.isArray(j.profiles)) {
                  j.profiles.forEach((p: any) => {
                    if (p.user_id) profilesMap0[p.user_id] = { first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url, username: p.username, email: p.email };
                  });
                }
              }
            } catch (_) {}
          }
          buyerChats.forEach((c: any) => {
            const product = productsMap0[c.product_id];
            if (!product) return;
            productConvs.push({
              type: 'product',
              productId: c.product_id,
              sellerId: c.seller_user_id,
              buyerId: undefined,
              sellerInfo: profilesMap0[c.seller_user_id] || null,
              bids: [],
              latestBid: null,
              highestBid: 0,
              product,
            });
          });
        }
        const combined = [...productConvs, ...userConversations];
        combined.sort((a, b) => {
          const aT = a.type === 'user' ? new Date(a.lastMessageAt || 0).getTime() : 0;
          const bT = b.type === 'user' ? new Date(b.lastMessageAt || 0).getTime() : 0;
          return bT - aT;
        });
        setAllConversations(combined);
        setLoadingBids(false);
        return;
      }

      // Get all product IDs from all bids
      const allProductIds = Array.from(new Set(allBids.map((bid: any) => bid.product_id).filter(Boolean)));
      
      console.log('📦 [loadAllBids] Product IDs from bids:', allProductIds.length, allProductIds.slice(0, 5));
      
      // Load all products - Include ALL statuses except deleted
      const { data: productsData, error: productsLoadError } = await supabase
        .from('products')
        .select('id, slug, title, description, category, subcategory, starting_price_ron, starting_price_eur, currency, images, user_id, status, custom_fields')
        .in('id', allProductIds)
        .neq('status', 'deleted');
      
      console.log('📦 [loadAllBids] Products loaded:', productsData?.length || 0, 'Error:', productsLoadError);

      if (productsLoadError) {
        console.error('Error loading products:', productsLoadError);
        return;
      }

      const productsMap: Record<string, Product> = {};
      (productsData || []).forEach((row: any) => {
        productsMap[row.id] = {
          id: row.id,
          slug: row.slug ?? undefined,
          title: row.title ?? '',
          description: row.description ?? '',
          category: row.category ?? '',
          subcategory: row.subcategory ?? '',
          startingPrice: row.starting_price_ron ?? row.starting_price_eur ?? 0,
          currency: row.currency ?? 'RON',
          images: Array.isArray(row?.images) ? row.images : [],
          user_id: row.user_id ?? undefined,
          customFields: row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
        };
      });

      // Get all user IDs (sellers for bids made, buyers for bids received)
      const userIds = new Set<string>();
      (bidsMade || []).forEach((bid: any) => {
        const product = productsMap[bid.product_id];
        if (product?.user_id) userIds.add(product.user_id);
      });
      bidsReceived.forEach((bid: any) => {
        if (bid.user_id) userIds.add(bid.user_id);
      });
      
      // Load user profiles
      let profilesMap: Record<string, any> = {};
      if (userIds.size > 0) {
        try {
          const response = await dashboardApiFetch('/api/admin/users/profiles', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userIds: Array.from(userIds) }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.profiles && Array.isArray(result.profiles)) {
              result.profiles.forEach((profile: any) => {
                if (profile.user_id) {
                  profilesMap[profile.user_id] = {
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    avatar_url: profile.avatar_url,
                    username: profile.username,
                    email: profile.email
                  };
                }
              });
            }
          }
        } catch (apiError) {
          console.error('Error loading profiles:', apiError);
        }
      }

      // Group bids by product and seller (for bids made) or buyer (for bids received)
      const conversationsMap = new Map<string, Conversation>();
      
      console.log('🔨 [loadAllBids] Starting to process bids into conversations...');
      console.log('🔨 [loadAllBids] Products map size:', Object.keys(productsMap).length);
      console.log('🔨 [loadAllBids] Bids made to process:', bidsMade?.length || 0);
      
      // Process bids made (user is buyer, seller is product owner)
      (bidsMade || []).forEach((bid: any) => {
        const product = productsMap[bid.product_id];
        
        if (!product) {
          console.log('⚠️ [loadAllBids] Bid has no product:', bid.product_id, 'Bid:', bid.id);
          return;
        }
        if (!product.user_id) {
          console.log('⚠️ [loadAllBids] Product has no user_id:', bid.product_id);
          return;
        }
        
        const key = `${bid.product_id}-${product.user_id}`;
        
        if (!conversationsMap.has(key)) {
          const newConv = {
            type: 'product' as const,  // IMPORTANT: Mark as product conversation!
            productId: bid.product_id,
            sellerId: product.user_id,
            buyerId: undefined, // For bids made, buyerId is currentUserId (not needed for key)
            sellerInfo: profilesMap[product.user_id] || null,
            bids: [],
            latestBid: null,
            highestBid: 0,
            product: product
          };
          conversationsMap.set(key, newConv);
          console.log('🆕 [loadAllBids] Created bids-made conversation:', {
            key,
            type: newConv.type,
            productTitle: product.title
          });
        }
        
        const conv = conversationsMap.get(key)!;
        conv.bids.push(bid);
      });

      // Process bids received (user is seller, buyer is bid owner)
      // Group by product and buyer - each buyer gets a separate conversation
      bidsReceived.forEach((bid: any) => {
        const product = productsMap[bid.product_id];
        if (!product || !bid.user_id) return;
        
        // For received bids, use buyerId as the key identifier
        // Since user is seller, we use currentUserId as sellerId
        const conversationKey = `${bid.product_id}-${bid.user_id}`;
        
        if (!conversationsMap.has(conversationKey)) {
          const newConv = {
            type: 'product' as const,  // IMPORTANT: Mark as product conversation!
            productId: bid.product_id,
            sellerId: currentUserId, // User is seller for received bids
            buyerId: bid.user_id, // Store buyer ID for uniqueness
            sellerInfo: profilesMap[bid.user_id] || null, // Buyer's info (displayed as "sellerInfo" for UI consistency)
            bids: [],
            latestBid: null,
            highestBid: 0,
            product: product
          };
          conversationsMap.set(conversationKey, newConv);
          console.log('🆕 [loadAllBids] Created bids-received conversation:', {
            conversationKey,
            type: newConv.type,
            productTitle: product.title
          });
        }
        
        const conv = conversationsMap.get(conversationKey)!;
        conv.bids.push(bid);
      });

      // Adaugă conversații din product_chats unde user e cumpărător (fără ofertă, ex. din "Scrie mesaj")
      const { data: buyerOnlyChats } = await supabase
        .from('product_chats')
        .select('product_id, seller_user_id')
        .eq('buyer_user_id', currentUserId);
      if (buyerOnlyChats && buyerOnlyChats.length > 0) {
        const extraProductIds = buyerOnlyChats.map((c: any) => c.product_id).filter((id: string) => !productsMap[id]);
        if (extraProductIds.length > 0) {
          const { data: extraProducts } = await supabase
            .from('products')
            .select('id, slug, title, description, category, subcategory, starting_price_ron, starting_price_eur, currency, images, user_id')
            .in('id', extraProductIds)
            .neq('status', 'deleted');
          (extraProducts || []).forEach((row: any) => {
            productsMap[row.id] = {
              id: row.id,
              slug: row.slug ?? undefined,
              title: row.title ?? '',
              description: row.description ?? '',
              category: row.category ?? '',
              subcategory: row.subcategory ?? '',
              startingPrice: row.starting_price_ron ?? row.starting_price_eur ?? 0,
              currency: row.currency ?? 'RON',
              images: Array.isArray(row?.images) ? row.images : [],
              user_id: row.user_id ?? undefined,
            };
          });
        }
        const extraSellerIds = buyerOnlyChats.map((c: any) => c.seller_user_id).filter((id: string) => !profilesMap[id]);
        if (extraSellerIds.length > 0) {
          try {
            const r = await dashboardApiFetch('/api/admin/users/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: extraSellerIds }) });
            if (r.ok) {
              const j = await r.json();
              if (j.success && Array.isArray(j.profiles)) {
                j.profiles.forEach((p: any) => {
                  if (p.user_id) profilesMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url, username: p.username, email: p.email };
                });
              }
            }
          } catch (_) {}
        }
        buyerOnlyChats.forEach((c: any) => {
          const key = `${c.product_id}-${c.seller_user_id}`;
          if (conversationsMap.has(key)) return;
          const product = productsMap[c.product_id];
          if (!product) return;
          conversationsMap.set(key, {
            type: 'product',
            productId: c.product_id,
            sellerId: c.seller_user_id,
            buyerId: undefined,
            sellerInfo: profilesMap[c.seller_user_id] || null,
            bids: [],
            latestBid: null,
            highestBid: 0,
            product,
          });
        });
      }
      
      // Adaugă și ofertele celuilalt utilizator pentru conversațiile în care user-ul a făcut oferte
      // Pentru fiecare conversație, trebuie să adăugăm TOATE ofertele pe același produs
      conversationsMap.forEach((conv, key) => {
        if (!conv.buyerId) {
          // Aceasta este o conversație de tip "bids made" (user este buyer, seller este sellerId)
          // Adaugă și ofertele făcute de seller (product owner) pe același produs
          // Seller-ul (product owner) face oferte ca user_id = sellerId pe produsul său
          const sellerBids = allBids.filter(b => 
            b.product_id === conv.productId && 
            b.user_id === conv.sellerId &&
            !conv.bids.some(existingBid => existingBid.id === b.id)
          );
          sellerBids.forEach(bid => {
            conv.bids.push(bid);
          });
        } else {
          // Aceasta este o conversație de tip "bids received" (user este seller, buyer este buyerId)
          // Adaugă și ofertele făcute de user (ca seller/product owner) pe același produs către același buyer
          // User-ul (seller) face oferte pe propriul produs (user_id = currentUserId = sellerId)
          const myBidsAsSeller = allBids.filter(b => 
            b.product_id === conv.productId && 
            b.user_id === currentUserId &&
            !conv.bids.some(existingBid => existingBid.id === b.id)
          );
          myBidsAsSeller.forEach(bid => {
            conv.bids.push(bid);
          });
        }
      });

      console.log('🗺️ [loadAllBids] Conversations map size:', conversationsMap.size);
      console.log('🗺️ [loadAllBids] Conversations keys:', Array.from(conversationsMap.keys()).slice(0, 5));
      console.log('🗺️ [loadAllBids] Sample conversation from map:', {
        key: Array.from(conversationsMap.keys())[0],
        value: conversationsMap.get(Array.from(conversationsMap.keys())[0])
      });
      
      // Process conversations
      const conversations: Conversation[] = Array.from(conversationsMap.values()).map(conv => {
        const sortedBids = [...conv.bids].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return {
          ...conv,
          type: 'product',  // IMPORTANT: Păstrează type=product când procesăm!
          latestBid: sortedBids[0],
          highestBid: Math.max(...conv.bids.map(b => b.amount || 0))
        };
      });
      
      console.log('🔍 [loadAllBids] After mapping conversationsMap:', {
        conversationsCount: conversations.length,
        sampleConversation: conversations[0] ? {
          productId: conversations[0].productId,
          type: conversations[0].type,
          bidsCount: conversations[0].bids?.length,
          hasLatestBid: !!conversations[0].latestBid
        } : null,
        allTypes: conversations.map(c => c.type).slice(0, 5)
      });

      // Sort conversations by latest bid date
      conversations.sort((a, b) => {
        if (!a.latestBid || !b.latestBid) return 0;
        return new Date(b.latestBid.created_at).getTime() - new Date(a.latestBid.created_at).getTime();
      });
      
      // Combină conversațiile (product_chats + user_chats) - userConversations deja încărcat mai sus
      const allConversations = [...conversations, ...userConversations];
      
      console.log('🔀 [loadAllBids] Before combining:', {
        productConversations: conversations.length,
        userConversations: userConversations.length,
        combined: allConversations.length,
        sampleProductConv: conversations[0]
      });
      
      // Sortează toate conversațiile după cea mai recentă activitate
      allConversations.sort((a, b) => {
        const aTime = a.type === 'user' 
          ? new Date(a.lastMessageAt || 0).getTime()
          : (a.latestBid ? new Date(a.latestBid.created_at).getTime() : 0);
        const bTime = b.type === 'user'
          ? new Date(b.lastMessageAt || 0).getTime()
          : (b.latestBid ? new Date(b.latestBid.created_at).getTime() : 0);
        return bTime - aTime;
      });
      
      console.log('📅 [loadAllBids] Sorted conversations (top 5):', 
        allConversations.slice(0, 5).map(c => ({
          productId: c.productId,
          type: c.type,
          bidsCount: c.bids.length,
          latestBidDate: c.latestBid?.created_at,
          latestBidAmount: c.latestBid?.amount,
          productTitle: c.product?.title,
          allBidsDates: c.bids.map(b => b.created_at).slice(0, 3) // Primele 3 date
        }))
      );
      
      // Log special pentru conversația cu iPhone-ul alb
      const iphoneConv = allConversations.find(c => 
        c.product?.title?.toLowerCase().includes('iphone') && 
        c.product?.title?.toLowerCase().includes('alb')
      );
      if (iphoneConv) {
        console.log('📱 [loadAllBids] iPhone alb conversation:', {
          productId: iphoneConv.productId,
          bidsCount: iphoneConv.bids.length,
          allBids: iphoneConv.bids.map(b => ({
            amount: b.amount,
            created_at: b.created_at,
            user_id: b.user_id
          })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        });
      }

      console.log('✅ [loadAllBids] Finished loading conversations:', {
        totalConversations: allConversations.length,
        productConversations: allConversations.filter(c => c.type === 'product').length,
        userConversations: allConversations.filter(c => c.type === 'user').length,
        productIds: allConversations.filter(c => c.type === 'product').map(c => c.productId)
      });

      console.log('🔄 [loadAllBids] About to update state with conversations:', {
        count: allConversations.length,
        firstConversation: allConversations[0] ? {
          productTitle: allConversations[0].product?.title,
          latestBidDate: allConversations[0].latestBid?.created_at
        } : null
      });
      
      setAllConversations(allConversations);
      setProducts(Object.values(productsMap));
      
      console.log('✅ [loadAllBids] State updated!');
    } catch (error: any) {
      console.error('❌ [loadAllBids] Error loading bids:', error);
    } finally {
      setLoadingBids(false);
    }
  }, [currentUserId, loadUserChats]);

  // Încarcă utilizatorii blocați
  const loadBlockedUsers = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await dashboardApiFetch('/api/user/block', {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBlockedUsers(new Set(data.blockedByMe || []));
        setUsersBlockedMe(new Set(data.blockedMe || []));
      }
    } catch (error) {
      console.error('[loadBlockedUsers] Error:', error);
    }
  }, [currentUserId]);

  // Încarcă conversațiile de rapoarte
  const loadReportChats = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await dashboardApiFetch('/api/report-chat', {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReportChats(data.chats || []);
      } else {
        console.error('[loadReportChats] Failed to load report chats');
      }
    } catch (error) {
      console.error('[loadReportChats] Error:', error);
    }
  }, [currentUserId]);

  // Încarcă mesajele pentru o conversație de raport
  const loadReportChatMessages = useCallback(async (chatId: string) => {
    if (!currentUserId || !chatId) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await dashboardApiFetch(`/api/report-chat/messages?chatId=${chatId}`, {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReportChatMessages(prev => ({
          ...prev,
          [chatId]: data.messages || []
        }));
      } else {
        console.error('[loadReportChatMessages] Failed to load messages');
      }
    } catch (error) {
      console.error('[loadReportChatMessages] Error:', error);
    }
  }, [currentUserId]);

  // Load bids when component mounts
  useEffect(() => {
    if (currentUserId) {
      console.log('🔄 Loading all conversations...');
      loadAllBids();
      loadBlockedUsers();
      loadReportChats();
    }
  }, [currentUserId, loadAllBids, loadBlockedUsers, loadReportChats]);
  
  // Separate effect for refreshTrigger to avoid dependency array size warnings
  useEffect(() => {
    if (refreshTrigger > 0 && currentUserId) {
      console.log('🔄 [Bid Placed] Refresh triggered (#' + refreshTrigger + '), reloading conversations...');
      console.log('📊 [Bid Placed] Current conversations count before reload:', allConversations.length);
      loadAllBids();
    }
  }, [refreshTrigger, currentUserId, allConversations.length]);

  // Încarcă mesajele când se selectează o conversație de raport
  useEffect(() => {
    if (selectedReportChat && !hiddenReportChats.has(selectedReportChat)) {
      loadReportChatMessages(selectedReportChat);
      // Auto-scroll la ultimul mesaj după încărcare
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  }, [selectedReportChat, loadReportChatMessages, hiddenReportChats]);

  // Resetează selecția dacă conversația de raportare selectată a fost ștearsă
  useEffect(() => {
    if (selectedReportChat) {
      const chatExists = reportChats.some(c => c.id === selectedReportChat && !hiddenReportChats.has(c.id));
      if (!chatExists) {
        console.log('[useEffect] Selected report chat no longer exists, resetting selection');
        setSelectedReportChat(null);
        setSelectedConversation(null);
      }
    }
  }, [selectedReportChat, reportChats, hiddenReportChats, setSelectedConversation]);

  // Încarcă mesajele din chat când se selectează o conversație
  useEffect(() => {
    if (selectedConversation && currentUserId) {
      // Verifică dacă este conversație de tip 'user'
      if (selectedConversation.type === 'user' && selectedConversation.userChatId) {
        console.log('[useEffect] Loading user chat messages for:', selectedConversation.userChatId);
        loadUserChatMessages(selectedConversation.userChatId);
        return;
      }

      // Conversație de tip 'product' (comportament existent)
      const productId = selectedConversation.productId;
      const conv = productId ? allConversations.find(c => 
        c.productId === productId && 
        c.sellerId === selectedConversation.sellerId &&
        c.buyerId === selectedConversation.buyerId // Include buyerId pentru identificare unică
      ) : null;
      
      if (conv && productId) {
        loadChatMessages(productId, selectedConversation.sellerId, conv.buyerId);
      }
    }
  }, [selectedConversation, currentUserId, allConversations, loadChatMessages, loadUserChatMessages]);

  // Forțează refresh când vii din "Cumpără acum"
  useEffect(() => {
    const openProductParam = searchParams.get('openProduct');
    const timestamp = searchParams.get('t');
    
    if (openProductParam) {
      console.log('🔄 [Bid Placed] Forcing conversations refresh...', { 
        openProductParam, 
        timestamp,
        currentUserId,
        allConversationsCount: allConversations.length 
      });
      setRefreshTrigger(prev => prev + 1);
    }
  }, [searchParams, currentUserId, allConversations.length]);

  // Deschide automat conversația când vine din "Cumpără acum"
  useEffect(() => {
    const openProductParam = searchParams.get('openProduct');
    
    if (!openProductParam) {
      return;
    }

    console.log('🔓 [Bid Placed] Detected openProduct parameter:', openProductParam);
    console.log('📊 [Bid Placed] Current conversations count:', allConversations.length);
    
    // Funcție pentru a încerca să găsească conversația
    const tryOpenConversation = () => {
      const conversation = allConversations.find(c => 
        c.productId === openProductParam && c.type === 'product'
      );
      
      if (conversation) {
        console.log('✅ [Bid Placed] Found conversation, opening...', {
          productId: conversation.productId,
          productTitle: conversation.product?.title,
          bidsCount: conversation.bids?.length,
          buyerId: conversation.buyerId,
          sellerId: conversation.sellerId
        });
        console.log('📊 [Bid Placed] All conversations in list:', allConversations.length);
        console.log('🔑 [Bid Placed] Conversation keys:', allConversations.map(c => {
          const key = c.buyerId 
            ? `${c.productId}-${c.buyerId}`
            : `${c.productId}-${c.sellerId}`;
          return {
            key,
            title: c.product?.title
          };
        }));
        
        // Verifică dacă conversația găsită este în allConversations
        const conversationKey = conversation.buyerId 
          ? `${conversation.productId}-${conversation.buyerId}`
          : `${conversation.productId}-${conversation.sellerId}`;
        const existsInList = allConversations.some(c => {
          const cKey = c.buyerId 
            ? `${c.productId}-${c.buyerId}`
            : `${c.productId}-${c.sellerId}`;
          return cKey === conversationKey;
        });
        console.log('🔍 [Bid Placed] Conversation exists in allConversations?', existsInList, conversationKey);
        
        // IMPORTANT: Elimină conversația din hiddenConversations pentru a o face vizibilă în listă!
        setHiddenConversations(prev => {
          const newSet = new Set(prev);
          newSet.delete(conversationKey);
          console.log('👁️ [Bid Placed] Removed from hidden conversations:', conversationKey);
          return newSet;
        });
        
        setSelectedConversation(conversation);
        
        // Scroll către conversația selectată în listă
        setTimeout(() => {
          const uniqueKey = conversation.buyerId 
            ? `${conversation.productId}-${conversation.buyerId}`
            : `${conversation.productId}-${conversation.sellerId}`;
          const element = document.querySelector(`[data-conversation-key="${uniqueKey}"]`);
          if (element) {
            console.log('📜 [Bid Placed] Scrolling to conversation element');
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            console.log('⚠️ [Bid Placed] Conversation element not found in DOM');
          }
        }, 300);
        
        // Elimină parametrul din URL după ce am deschis conversația
        setTimeout(() => {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }, 500);
        
        return true;
      }
      
      return false;
    };
    
    // Încearcă imediat
    if (!tryOpenConversation()) {
      console.log('⏳ [Bid Placed] Conversation not found, will retry...');
      
      // Retry #1 după 800ms
      const timer1 = setTimeout(() => {
        if (!tryOpenConversation()) {
          console.log('⏳ [Bid Placed] Still not found, retry #2...');
          
          // Retry #2 după 1.5s total
          const timer2 = setTimeout(() => {
            if (!tryOpenConversation()) {
              console.log('⏳ [Bid Placed] Still not found, retry #3 (force reload)...');
              
              // Retry #3 cu force reload după 2.5s total
              loadAllBids().then(() => {
                const timer3 = setTimeout(() => {
                  if (!tryOpenConversation()) {
                    console.log('❌ [Bid Placed] Conversation not found after all retries');
                    // Curăță parametrul chiar dacă nu am găsit conversația
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                  }
                }, 1000);
                return () => clearTimeout(timer3);
              });
            }
          }, 1500);
          
          return () => clearTimeout(timer2);
        }
      }, 800);
      
      return () => clearTimeout(timer1);
    }
  }, [searchParams, allConversations, setSelectedConversation, loadAllBids]);

  // Încarcă statusurile de follow și statisticile pentru utilizatorii din conversații
  useEffect(() => {
    const loadFollowStatusesAndStats = async () => {
      if (!currentUserId || allConversations.length === 0) return;
      
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;
        
        // Colectează toți userii din conversații (sellerId sau buyerId)
        const userIds = new Set<string>();
        allConversations.forEach(conv => {
          if (conv.sellerId && conv.sellerId !== currentUserId) userIds.add(conv.sellerId);
          if (conv.buyerId && conv.buyerId !== currentUserId) userIds.add(conv.buyerId);
        });
        
        // Verifică pentru fiecare utilizator dacă este urmărit și încarcă statisticile
        const promises = Array.from(userIds).map(async (userId) => {
          try {
            const [followRes, reviewsRes, followsRes, verificationRes, reactionsRes] = await Promise.all([
              dashboardApiFetch(`/api/user/follow?followedUserId=${userId}`),
              supabase.from('user_reviews').select('rating').eq('reviewed_user_id', userId),
              supabase.from('user_follows').select('follower_user_id,followed_user_id'),
              dashboardApiFetch(`/api/user/verification/${userId}`),
              dashboardApiFetch(`/api/user/reaction?targetUserId=${userId}`),
            ]);
            
            const isFollowing = followRes.ok ? (await followRes.json()).isFollowing : false;
            
            // Procesează reacțiile (Like/Dislike)
            let likeCount = 0;
            let dislikeCount = 0;
            let userReaction: string | null = null;
            
            if (reactionsRes.ok) {
              const reactionsData = await reactionsRes.json();
              likeCount = reactionsData.likeCount || 0;
              dislikeCount = reactionsData.dislikeCount || 0;
              userReaction = reactionsData.userReaction;
              
              // Setează state-urile pentru Like/Dislike
              setLikeCounts(prev => ({ ...prev, [userId]: likeCount }));
              setDislikeCounts(prev => ({ ...prev, [userId]: dislikeCount }));
              
              if (userReaction === 'like') {
                setLikedBids(prev => new Set(prev).add(userId));
              } else if (userReaction === 'dislike') {
                setDislikedBids(prev => new Set(prev).add(userId));
              }
            }
            
            // Calculează rating și procent pozitiv
            let rating = 0;
            let positivePercent = 0;
            const reviewCount = reviewsRes.data ? reviewsRes.data.length : 0;
            if (reviewsRes.data && reviewsRes.data.length > 0) {
              const ratings = reviewsRes.data.map((r: { rating?: number | null }) => r.rating || 0);
              rating =
                Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) /
                10;
              const positiveCount = ratings.filter((r: number) => r >= 4).length;
              positivePercent = Math.round((positiveCount / ratings.length) * 100 * 10) / 10;
            }
            
            // Calculează urmăritori și urmărește
            let followers = 0;
            let following = 0;
            if (followsRes.data) {
              followers = followsRes.data.filter(
                (f: { followed_user_id?: string; follower_user_id?: string }) =>
                  f.followed_user_id === userId,
              ).length;
              following = followsRes.data.filter(
                (f: { followed_user_id?: string; follower_user_id?: string }) =>
                  f.follower_user_id === userId,
              ).length;
            }
            
            // Ultima conectare din auth.users (via verification API)
            let lastConnection: string | null = null;
            if (verificationRes.ok) {
              const verificationData = await verificationRes.json();
              if (verificationData.lastSignInAt) {
                lastConnection = verificationData.lastSignInAt;
              }
            } else {
              console.error(`[loadFollowStatusesAndStats] Error loading verification for ${userId}:`, verificationRes.status);
            }
            
            return {
              userId,
              isFollowing,
              stats: {
                rating,
                positivePercent,
                lastConnection,
                followers,
                following,
                reviewCount,
              },
            };
          } catch (error) {
            console.error(`Error loading stats for ${userId}:`, error);
            return {
              userId,
              isFollowing: false,
              stats: {
                rating: 0,
                positivePercent: 0,
                lastConnection: null,
                followers: 0,
                following: 0,
                reviewCount: 0,
              },
            };
          }
        });
        
        const results = await Promise.all(promises);
        const newFollowingUsers = new Set<string>();
        const newUserStats: Record<string, any> = {};
        
        results.forEach(({ userId, isFollowing, stats }) => {
          if (isFollowing) {
            newFollowingUsers.add(userId);
          }
          newUserStats[userId] = stats;
        });
        
        setFollowingUsers(newFollowingUsers);
        setUserStats(newUserStats);
      } catch (error) {
        console.error('Error loading follow statuses and stats:', error);
      }
    };
    
    loadFollowStatusesAndStats();
  }, [currentUserId, allConversations]);

  // Supabase Realtime pentru modificările de metadata (blocare/deblocare chat)
  useEffect(() => {
    if (!currentUserId || Object.keys(chatIds).length === 0) return;

    const channels: any[] = [];

    // Creează un subscription pentru modificările de metadata pe fiecare chat
    Object.entries(chatIds).forEach(([conversationKey, chatId]) => {
      const channel = supabase
        .channel(`product-chat-metadata-${chatId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'product_chats',
            filter: `id=eq.${chatId}`,
          },
          async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const updatedChat = payload.new as Record<string, unknown> & { metadata?: Record<string, unknown> };
            const metadata = updatedChat.metadata || {};
            
            console.log('[Realtime Metadata] Chat metadata updated:', {
              chatId,
              conversationKey,
              metadata
            });

            // Actualizează starea de blocare din metadata
            const blockedBySeller = metadata.blocked_by_seller === true;
            const blockedByBuyer = metadata.blocked_by_buyer === true;
            
            setBlockedChats(prev => ({
              ...prev,
              [conversationKey]: {
                blocked_by_seller: blockedBySeller,
                blocked_by_buyer: blockedByBuyer
              }
            }));

            // Reîncarcă mesajele pentru a include mesajele de sistem noi (dacă există)
            const conv = allConversations.find((c: Conversation) => {
              const key = c.buyerId
                ? `${c.productId}-${c.buyerId}`
                : `${c.productId}-${c.sellerId}`;
              return key === conversationKey;
            });

            if (conv) {
              await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
            }
          }
        )
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [currentUserId, chatIds, allConversations, loadChatMessages]);

  // Supabase Realtime pentru mesajele de chat
  useEffect(() => {
    const chatKeys = Object.keys(chatIds);
    if (!currentUserId || chatKeys.length === 0) {
      console.log('[Realtime Messages] Skipping subscription - missing userId or chatIds');
      return;
    }

    console.log('[Realtime Messages] Setting up subscriptions for chats:', chatKeys);
    const channels: any[] = [];

    // Creează un subscription pentru fiecare chat
    Object.entries(chatIds).forEach(([conversationKey, chatId]) => {
      // Verifică dacă chatId este valid
      if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
        console.warn(`[Realtime Messages] Skipping invalid chatId for conversation: ${conversationKey}`, { chatId });
        return;
      }

      const channelName = `product-chat-${chatId}`;
      console.log(`[Realtime Messages] Creating channel: ${channelName} for chatId: ${chatId}`);
      
      const channel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: '' }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'product_chat_messages',
            filter: `chat_id=eq.${chatId}`,
          },
          async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const row = payload.new as Record<string, unknown>;
            console.log('[Realtime Messages] INSERT event received:', {
              chatId,
              conversationKey,
              messageId: row?.id,
              senderId: row?.sender_user_id,
              eventType: payload.eventType,
            });

            const newMessage = payload.new as Record<string, unknown> & {
              sender_user_id?: string;
              id?: string;
            };

            // Verifică dacă mesajul este pentru utilizatorul curent
            const conv = allConversationsRef.current.find((c: Conversation) => {
              const key = c.buyerId 
                ? `${c.productId}-${c.buyerId}`
                : `${c.productId}-${c.sellerId}`;
              return key === conversationKey;
            });

            if (conv) {
              // Reîncarcă mesajele pentru a asigura sincronizarea corectă
              await loadChatMessagesRef.current(conv.productId, conv.sellerId, conv.buyerId);
              
              // Actualizează numărul de mesaje necitite dacă mesajul nu este de la user
              if (newMessage.sender_user_id !== currentUserId) {
                setUnreadCounts(prev => {
                  const current = prev[conversationKey] || 0;
                  return {
                    ...prev,
                    [conversationKey]: current + 1
                  };
                });
              }

              // Auto-scroll dacă conversația este deschisă
              if (selectedConversation) {
                const selectedKey = conv.buyerId 
                  ? `${conv.productId}-${conv.buyerId}`
                  : `${conv.productId}-${conv.sellerId}`;
                if (selectedKey === conversationKey) {
                  setTimeout(() => {
                    if (messagesEndRef.current) {
                      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 200);
                }
              }
            } else {
              console.warn('[Realtime Messages] Conversation not found for key:', conversationKey);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'product_chat_messages',
            filter: `chat_id=eq.${chatId}`,
          },
          async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const row = payload.new as Record<string, unknown>;
            console.log('[Realtime Messages] UPDATE event received:', {
              chatId,
              conversationKey,
              messageId: row?.id,
            });

            // Reîncarcă mesajele pentru a asigura sincronizarea corectă
            const conv = allConversationsRef.current.find((c: Conversation) => {
              const key = c.buyerId 
                ? `${c.productId}-${c.buyerId}`
                : `${c.productId}-${c.sellerId}`;
              return key === conversationKey;
            });
            
            if (conv) {
              await loadChatMessagesRef.current(conv.productId, conv.sellerId, conv.buyerId);
            }
          }
        )
        .subscribe(async (status: string, err: unknown) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Realtime Messages] Successfully subscribed to channel: ${channelName}`);
          } else if (status === 'CHANNEL_ERROR') {
            // Logăm eroarea dar nu o considerăm critică - mesajele pot funcționa și fără Realtime
            console.warn(`[Realtime Messages] Channel error for: ${channelName}`, {
              error: err || 'Unknown error',
              chatId,
              conversationKey,
              channelName,
              note: 'Realtime subscription failed, but messages will still work. You may need to refresh to see new messages.'
            });
            
            // În caz de eroare, putem încerca să reîncărcăm mesajele periodic ca fallback
            // (dar nu implementăm acum pentru a evita prea multe requests)
          } else if (status === 'TIMED_OUT') {
            console.warn(`[Realtime Messages] Channel subscription timed out: ${channelName} - messages will still work`);
          } else if (status === 'CLOSED') {
            console.log(`[Realtime Messages] Channel closed: ${channelName}`);
          } else {
            console.log(`[Realtime Messages] Channel ${channelName} status:`, status);
          }
        });

      channels.push(channel);
    });

    return () => {
      console.log('[Realtime Messages] Cleaning up subscriptions');
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, JSON.stringify(Object.keys(chatIds).sort())]);

  // Supabase Realtime pentru bids noi
  useEffect(() => {
    if (!currentUserId || allConversations.length === 0) return;

    // Creează un subscription pentru toate produsele relevante
    const productIds = Array.from(new Set(allConversations.map(c => c.productId)));
    
    if (productIds.length === 0) return;
    
    // Creează un channel pentru fiecare productId pentru a evita problemele cu filtru
    const channels: any[] = [];
    
    productIds.forEach(productId => {
      const channel = supabase
        .channel(`bids-updates-${productId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bids',
            filter: `product_id=eq.${productId}`,
          },
          async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const newBid = payload.new as Record<string, unknown> & {
              product_id?: string;
              user_id?: string;
            };

            // Verifică dacă bid-ul este relevant pentru utilizator
            const relevantConv = allConversations.find((c: Conversation) =>
              c.productId === newBid.product_id && 
              (newBid.user_id === currentUserId || c.product.user_id === currentUserId)
            );

            if (relevantConv) {
              // Actualizează numărul de mesaje necitite dacă bid-ul nu este de la user
              if (newBid.user_id !== currentUserId) {
                const conversationKey = relevantConv.buyerId 
                  ? `${relevantConv.productId}-${relevantConv.buyerId}`
                  : `${relevantConv.productId}-${relevantConv.sellerId}`;
                
                setUnreadCounts(prev => {
                  const current = prev[conversationKey] || 0;
                  return {
                    ...prev,
                    [conversationKey]: current + 1
                  };
                });
              }
              
              // Reîncarcă ofertele pentru a include bid-ul nou (după update-ul notificărilor)
              await loadAllBids();
              
              // Auto-scroll dacă conversația este deschisă
              if (selectedConversation && 
                  selectedConversation.productId === relevantConv.productId &&
                  selectedConversation.sellerId === relevantConv.sellerId &&
                  selectedConversation.buyerId === relevantConv.buyerId) {
                setTimeout(() => {
                  if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                  }
                }, 100);
              }
            }
          }
        )
        .subscribe();
      
      channels.push(channel);
    });

    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [currentUserId, allConversations, loadAllBids, selectedConversation]);

  // Încarcă conversațiile ascunse din baza de date (prioritar) și sincronizează cu localStorage
  useEffect(() => {
    if (!currentUserId) return;

    const loadHiddenConversations = async () => {
      if (!currentUserProfile) return;
      
      // Admin-ii pot vedea toate conversațiile, inclusiv cele ascunse
      if (currentUserProfile.is_admin === true) {
        return;
      }

      try {
        // Obține toate chat-urile unde utilizatorul este implicat și care sunt ascunse de el
        // Query 1: chats unde currentUserId e buyer
        const { data: chatsAsBuyer } = await supabase
          .from('product_chats')
          .select('id, hidden_by_user_ids, buyer_user_id, seller_user_id, product_id')
          .eq('buyer_user_id', currentUserId);

        // Query 2: chats unde currentUserId e seller
        const { data: chatsAsSeller } = await supabase
          .from('product_chats')
          .select('id, hidden_by_user_ids, buyer_user_id, seller_user_id, product_id')
          .eq('seller_user_id', currentUserId);

        // Combină rezultatele
        const hiddenChats = [
          ...(chatsAsBuyer || []),
          ...(chatsAsSeller || [])
        ];


        // Construiește setul de conversații ascunse DIN BAZA DE DATE (sursa principală)
        const hiddenKeys = new Set<string>();
        hiddenChats?.forEach(chat => {
          if (chat.hidden_by_user_ids && Array.isArray(chat.hidden_by_user_ids)) {
            if (chat.hidden_by_user_ids.includes(currentUserId)) {
              // Găsește conversationKey pentru acest chat
              const buyerId = chat.buyer_user_id === currentUserId ? chat.seller_user_id : chat.buyer_user_id;
              const conversationKey = `${chat.product_id}-${buyerId}`;
              hiddenKeys.add(conversationKey);
            }
          }
        });

        // Încarcă conversațiile ascunse fără chatId (din user_settings)
        const { data: hiddenNoChatSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'hidden_conversations_no_chat')
          .maybeSingle();

        if (hiddenNoChatSettings?.data?.conversations && Array.isArray(hiddenNoChatSettings.data.conversations)) {
          hiddenNoChatSettings.data.conversations.forEach((key: string) => {
            hiddenKeys.add(key);
          });
        }

        // Încarcă user_chats ascunse (din user_settings)
        const { data: hiddenUserChatsSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'hidden_user_chats')
          .maybeSingle();

        if (hiddenUserChatsSettings?.data?.conversations && Array.isArray(hiddenUserChatsSettings.data.conversations)) {
          hiddenUserChatsSettings.data.conversations.forEach((key: string) => {
            hiddenKeys.add(key);
          });
        }

        // Setează direct din baza de date (sursa unică de adevăr) - combină cu cele fără chatId
        setHiddenConversations(hiddenKeys);

        // Încarcă conversațiile de raportare ascunse din user_settings
        const { data: hiddenReportSettings } = await supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', currentUserId)
          .eq('category', 'hidden_report_chats')
          .maybeSingle();

        const hiddenReportIds = new Set<string>();
        if (hiddenReportSettings?.data?.chats && Array.isArray(hiddenReportSettings.data.chats)) {
          hiddenReportSettings.data.chats.forEach((chatId: string) => {
            hiddenReportIds.add(chatId);
          });
        }
        
        setHiddenReportChats(hiddenReportIds);
      } catch (error) {
        console.error('[loadHiddenConversations] Error:', error);
        // Dacă există eroare, lăsăm seturile goale - datele trebuie să vină din baza de date
        setHiddenConversations(new Set());
        setHiddenReportChats(new Set());
      }
    };

    loadHiddenConversations();
  }, [currentUserId, currentUserProfile, allConversations]);

  // Încarcă mesajele și ofertele necitite pentru toate conversațiile
  useEffect(() => {
    const loadUnreadCounts = async () => {
      if (!currentUserId || allConversations.length === 0) {
        setUnreadCounts({});
        return;
      }

      try {
        const unreadMap: Record<string, number> = {};

        // Pentru fiecare conversație, verificăm mesajele necitite și ofertele noi
        for (const conv of allConversations) {
          // SKIP user_chats - acestea sunt gestionate separat în loadUserChats
          if (conv.type === 'user') {
            continue;
          }

          const conversationKey = conv.buyerId 
            ? `${conv.productId}-${conv.buyerId}` // Received bids: productId-buyerId
            : `${conv.productId}-${conv.sellerId}`; // Made bids: productId-sellerId
          
          let totalUnread = 0;

          // 1. Verifică mesajele necitite din product_chat_messages
          try {
            // Găsește chat-ul pentru această conversație (doar pentru product_chats)
            const chatQuery: any = {
              product_id: conv.productId,
            };

            if (conv.buyerId) {
              // Pentru bids received: user este seller, buyer este buyerId
              chatQuery.seller_user_id = currentUserId;
              chatQuery.buyer_user_id = conv.buyerId;
            } else {
              // Pentru bids made: user este buyer, seller este sellerId
              chatQuery.buyer_user_id = currentUserId;
              chatQuery.seller_user_id = conv.sellerId;
            }

            const { data: chat } = await supabase
              .from('product_chats')
              .select('id')
              .match(chatQuery)
              .maybeSingle();

            if (chat) {
              // Salvează chatId pentru Realtime
              setChatIds(prev => ({
                ...prev,
                [conversationKey]: chat.id
              }));

              // Numără mesajele necitite
              const { data: unreadMessages } = await supabase
                .from('product_chat_messages')
                .select('id')
                .eq('chat_id', chat.id)
                .eq('is_read', false)
                .neq('sender_user_id', currentUserId);

              if (unreadMessages) {
                totalUnread += unreadMessages.length;
              }
            }
          } catch (error) {
            console.error(`[loadUnreadCounts] Error loading messages for ${conversationKey}:`, error);
          }

          // 2. Verifică notificările necitite pentru oferte noi
          try {
            // Verifică notificări de tip 'bid' sau 'counter_offer' sau 'product_chat_message'
            const { data: unreadNotifications } = await supabase
              .from('user_notifications')
              .select('id, metadata')
              .eq('user_id', currentUserId)
              .is('read_at', null)
              .in('type', ['bid', 'counter_offer', 'product_chat_message']);

            if (unreadNotifications) {
              // Filtrează notificările relevante pentru această conversație
              const relevantNotifications = unreadNotifications.filter(
                (notif: { metadata?: Record<string, unknown> | null }) => {
                const metadata = (notif.metadata || {}) as Record<string, unknown>;
                if (conv.buyerId) {
                  return metadata.product_id === conv.productId && metadata.buyer_user_id === conv.buyerId;
                } else {
                  return metadata.product_id === conv.productId && metadata.seller_user_id === conv.sellerId;
                }
              },
              );

              totalUnread += relevantNotifications.length;
            }
          } catch (error) {
            console.error(`[loadUnreadCounts] Error loading notifications for ${conversationKey}:`, error);
          }

          if (totalUnread > 0) {
            unreadMap[conversationKey] = totalUnread;
          }
        }

        setUnreadCounts(unreadMap);
      } catch (error) {
        console.error('[loadUnreadCounts] Error loading unread counts:', error);
      }
    };

    loadUnreadCounts();

    // Reîncarcă mesajele necitite la fiecare 5 secunde (fallback în cazul în care Realtime nu funcționează)
    const interval = setInterval(loadUnreadCounts, 5000);

    return () => clearInterval(interval);
  }, [currentUserId, allConversations]);

  // Marchează mesajele și notificările ca citite când se deschide conversația
  useEffect(() => {
    const markAsRead = async () => {
      if (!selectedConversation || !currentUserId) return;

      // Găsește conversația corespunzătoare
      const conv = allConversations.find(
        c => c.productId === selectedConversation.productId && 
        c.sellerId === selectedConversation.sellerId &&
        c.buyerId === selectedConversation.buyerId // Include buyerId pentru identificare unică
      );

      if (!conv) return;

      const conversationKey = conv.buyerId 
        ? `${conv.productId}-${conv.buyerId}`
        : `${conv.productId}-${conv.sellerId}`;

      try {
        // 1. Marchează mesajele ca citite (chiar dacă nu există unreadCounts, marchează-le când conversația este deschisă)
        const chatId = chatIds[conversationKey];
        if (chatId) {
          await supabase
            .from('product_chat_messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .eq('is_read', false)
            .neq('sender_user_id', currentUserId);
        }

        // 2. Marchează notificările ca citite
        const { data: notifications } = await supabase
          .from('user_notifications')
          .select('id, metadata')
          .eq('user_id', currentUserId)
          .is('read_at', null)
          .in('type', ['bid', 'counter_offer', 'product_chat_message']);

        if (notifications) {
          const relevantNotifications = notifications.filter(
            (notif: { id: string; metadata?: Record<string, unknown> | null }) => {
            const metadata = (notif.metadata || {}) as Record<string, unknown>;
            if (conv.buyerId) {
              return metadata.product_id === conv.productId && metadata.buyer_user_id === conv.buyerId;
            } else {
              return metadata.product_id === conv.productId && metadata.seller_user_id === conv.sellerId;
            }
          },
          );

          if (relevantNotifications.length > 0) {
            const notificationIds = relevantNotifications.map((n: { id: string }) => n.id);
            await supabase
              .from('user_notifications')
              .update({ read_at: new Date().toISOString() })
              .in('id', notificationIds);
          }
        }

        // Elimină conversația din lista de mesaje necitite
        setUnreadCounts(prev => {
          const newState = { ...prev };
          delete newState[conversationKey];
          return newState;
        });
      } catch (error) {
        console.error('[markAsRead] Error marking as read:', error);
      }
    };

    markAsRead();
  }, [selectedConversation, currentUserId, allConversations, chatIds]);

  // Încarcă mesajele când e selectată o conversație produs (inclusiv după „Scrie mesaj” din URL)
  useEffect(() => {
    if (!selectedConversation?.productId || selectedConversation.type === 'user' || !currentUserId) return;
    const conv = allConversations.find(
      c => c.productId === selectedConversation.productId &&
        c.sellerId === selectedConversation.sellerId &&
        (c.buyerId === selectedConversation.buyerId || (c.buyerId == null && selectedConversation.buyerId == null))
    );
    if (conv && conv.type === 'product') {
      loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
    }
  }, [selectedConversation, allConversations, currentUserId, loadChatMessages]);

  const formatPrice = (price: number, currency: string) => {
    return `${price.toLocaleString('ro-RO')} ${currency}`;
  };

  // Funcție pentru acceptarea unei oferte
  const handleAcceptBid = useCallback(async (productId: string, bidId: string, bidAmount: number) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Autentificare necesară', 'Trebuie să fii autentificat pentru a accepta oferte.');
        return;
      }

      // Verifică dacă utilizatorul curent a blocat celălalt utilizator sau este blocat de acesta
      const conv = allConversations.find(c => c.productId === productId);
      if (conv) {
        const targetUserId = conv.buyerId && conv.buyerId !== currentUserId
          ? conv.buyerId
          : conv.sellerId && conv.sellerId !== currentUserId
            ? conv.sellerId
            : null;

        if (targetUserId) {
          if (blockedUsers.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Nu poți accepta oferte de la un utilizator pe care l-ai blocat.');
            return;
          }
          if (usersBlockedMe.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți accepta oferte.');
            return;
          }
        }
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
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la acceptarea ofertei');
        return;
      }

      // Setează oferta acceptată temporar și pornește countdown-ul de 5 minute (300 secunde)
      setAcceptedBids(prev => ({
        ...prev,
        [productId]: { bidId, acceptedAt: Date.now() }
      }));
      setCountdowns(prev => ({
        ...prev,
        [productId]: 300 // 5 minute în secunde
      }));

      // Reîncarcă ofertele
      await loadAllBids();
    } catch (error: any) {
      console.error('Error accepting bid:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadAllBids, currentUserId, allConversations, blockedUsers, usersBlockedMe]);

  // Funcție pentru finalizarea imediată a acceptării (fără așteptare)
  const handleFinalizeAccept = useCallback(async (productId: string, bidId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Autentificare necesară', 'Trebuie să fii autentificat pentru a finaliza acceptarea.');
        return;
      }

      // Marchează oferta ca is_winning = true în baza de date prin API
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

      if (!response.ok) {
        const result = await response.json();
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la finalizarea acceptării');
        return;
      }

      // Resetează countdown-ul pentru a finaliza acceptarea imediat
      setCountdowns(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      
      // Deblochează automat chat-ul dacă era blocat (doar când acceptarea este definitivă)
      const conv = allConversations.find(c => c.productId === productId);
      if (conv) {
        const conversationKey = conv.buyerId 
          ? `${conv.productId}-${conv.buyerId}`
          : `${conv.productId}-${conv.sellerId}`;
        const chatId = chatIds[conversationKey];
        
        if (chatId) {
          // Verifică dacă chat-ul era blocat înainte
          const blockState = blockedChats[conversationKey];
          const wasBlocked = blockState?.blocked_by_seller || blockState?.blocked_by_buyer;
          
          if (wasBlocked) {
            // Actualizează metadata pentru a debloca chat-ul
            await dashboardApiFetch('/api/product-chat/update-metadata', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId: chatId,
                metadata: {
                  blocked_by_seller: false,
                  blocked_by_buyer: false
                }
              }),
            });

            // Trimite mesaj automat de deblocare doar dacă chat-ul era blocat
            await dashboardApiFetch('/api/product-chat/system-message', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId: chatId,
                messageText: 'GoBid mesaj automat: Deoarece s-a ajuns la un consens, chat-ul este deblocat pentru comunicare.'
              }),
            });

            // Actualizează state-ul local
            setBlockedChats(prev => ({
              ...prev,
              [conversationKey]: {
                blocked_by_seller: false,
                blocked_by_buyer: false
              }
            }));
          }
          
          // Trimite mesaj în chat că oferta a fost acceptată complet
          try {
            // Găsește oferta acceptată pentru a afișa suma
            const acceptedBid = conv.bids?.find(b => b.id === bidId);
            const bidAmount = acceptedBid?.amount || 0;
            const currency = conv.product.currency || 'RON';
            const formattedAmount = new Intl.NumberFormat('ro-RO', {
              style: 'currency',
              currency: currency,
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(bidAmount);
            
            // Trimite mesaj automat că oferta a fost acceptată
            await dashboardApiFetch('/api/product-chat/system-message', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId: chatId,
                messageText: `Oferta de ${formattedAmount} a fost acceptată!`
              }),
            });
          } catch (msgError) {
            console.error('[handleFinalizeAccept] Error sending acceptance message:', msgError);
          }
          
          // Reîncarcă mesajele pentru a afișa noul mesaj
          await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
        }
      }
      
      // Reîncarcă ofertele pentru a actualiza statusul
      await loadAllBids();
    } catch (error: any) {
      console.error('Error finalizing accept:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la finalizarea acceptării');
    }
  }, [loadAllBids, allConversations, chatIds, blockedChats, loadChatMessages]);

  // Funcție pentru anularea acceptării unei oferte
  const handleCancelAccept = useCallback(async (productId: string, bidId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Autentificare necesară', 'Trebuie să fii autentificat pentru a anula acceptarea.');
        return;
      }

      // Resetează oferta acceptată în baza de date
      const response = await dashboardApiFetch('/api/bids/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          bid_id: bidId,
          cancel: true, // Flag pentru anulare
        }),
      });

      // Elimină acceptarea local
      setAcceptedBids(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      setCountdowns(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });

      // Reîncarcă ofertele pentru a actualiza statusul
      await loadAllBids();
    } catch (error: any) {
      console.error('Error canceling accept:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la anularea acceptării');
    }
  }, [loadAllBids]);

  // Funcție pentru refuzarea unei oferte
  const handleRefuseBid = useCallback(async (productId: string, bidId: string, bidAmount: number) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Autentificare necesară', 'Trebuie să fii autentificat pentru a refuza oferte.');
        return;
      }

      console.log('🚫 [handleRefuseBid] Refusing bid:', { productId, bidId, bidAmount });

      // Apelează API-ul pentru refuzare
      const response = await dashboardApiFetch('/api/bids/reject', {
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

      if (!response.ok || !result.success) {
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la refuzarea ofertei');
        return;
      }

      console.log('✅ [handleRefuseBid] Bid refused successfully');

      // Găsește conversația ÎNAINTE de refresh pentru a trimite mesajul
      const conv = allConversations.find(c => c.productId === productId);
      console.log('🔍 [handleRefuseBid] Found conversation:', {
        found: !!conv,
        chatId: conv?.chatId,
        userChatId: conv?.userChatId,
        productId: conv?.productId,
        sellerId: conv?.sellerId,
        buyerId: conv?.buyerId,
        blocked: conv?.chatId ? blockedChats[conv.chatId] : null,
        allConversationsCount: allConversations.length
      });

      // Trimite notificare în chat că oferta a fost refuzată
      if (conv) {
        try {
          const formattedAmount = new Intl.NumberFormat('ro-RO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(bidAmount);

          const messageText = `Oferta de ${formattedAmount} Lei a fost refuzată.`;
          
          // Încearcă mai întâi cu chatId
          if (conv.chatId || conv.userChatId) {
            const chatId = conv.userChatId || conv.chatId;
            console.log('📤 [handleRefuseBid] Sending refusal message via chatId:', { chatId, messageText });

            const msgResponse = await dashboardApiFetch('/api/product-chat/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chatId: chatId,
                messageText: messageText,
                isSystemMessage: true
              }),
            });

            const msgResult = await msgResponse.json();
            console.log('📨 [handleRefuseBid] Message sent result (chatId):', msgResult);

            if (!msgResponse.ok) {
              console.error('❌ [handleRefuseBid] Failed to send message via chatId:', msgResult);
            }
          } else if (conv.productId && conv.buyerId) {
            // Dacă nu avem chatId, folosim productId și buyerId
            console.log('📤 [handleRefuseBid] Sending refusal message via productId:', { 
              productId: conv.productId, 
              buyerId: conv.buyerId, 
              messageText 
            });

            const msgResponse = await dashboardApiFetch('/api/product-chat/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                productId: conv.productId,
                buyerId: conv.buyerId,
                messageText: messageText,
                isSystemMessage: true
              }),
            });

            const msgResult = await msgResponse.json();
            console.log('📨 [handleRefuseBid] Message sent result (productId):', msgResult);

            if (!msgResponse.ok) {
              console.error('❌ [handleRefuseBid] Failed to send message via productId:', msgResult);
            }
          }
        } catch (msgError) {
          console.error('[handleRefuseBid] Error sending refusal message:', msgError);
        }
        
        // Reîncarcă mesajele pentru a afișa noul mesaj de refuzare
        console.log('🔄 [handleRefuseBid] Reloading chat messages...');
        await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
      } else {
        console.warn('⚠️ [handleRefuseBid] Cannot send message - conversation not found');
      }

      // Reîncarcă TOATE ofertele la final pentru a actualiza lista din stânga
      console.log('🔄 [handleRefuseBid] Reloading all bids and conversations...');
      await loadAllBids();
      
      console.log('✅ [handleRefuseBid] Refusal completed and UI refreshed');
    } catch (error: any) {
      console.error('[handleRefuseBid] Error:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la refuzarea ofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadAllBids, allConversations, blockedChats, loadChatMessages]);

  // Funcție pentru contraoferta directă (fără modal)
  const handleCounterOfferDirect = useCallback(async (productId: string, bidId: string, currentAmount: number, currency: string) => {
    // Folosește o sumă incrementată automat (ex: +10 sau 5%)
    const increment = Math.max(10, Math.ceil(currentAmount * 0.05));
    const amount = currentAmount + increment;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Eroare', 'Trebuie să fii autentificat');
        return;
      }

      // Verifică dacă utilizatorul curent a blocat celălalt utilizator sau este blocat de acesta
      const conv = allConversations.find(c => c.productId === productId);
      if (conv) {
        const targetUserId = conv.buyerId && conv.buyerId !== currentUserId
          ? conv.buyerId
          : conv.sellerId && conv.sellerId !== currentUserId
            ? conv.sellerId
            : null;

        if (targetUserId) {
          if (blockedUsers.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Nu poți plasa contraoferte către un utilizator pe care l-ai blocat.');
            return;
          }
          if (usersBlockedMe.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți plasa contraoferte.');
            return;
          }
        }
      }

      const response = await dashboardApiFetch('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          amount: amount,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const bidId = (result as { bid?: { id?: string } })?.bid?.id;
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
        await loadAllBids();
        // Nu mai afișăm modal de succes
      } else {
        const result = await response.json();
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la trimiterea contraofertei');
      }
    } catch (error: any) {
      console.error('Error placing counter offer:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadAllBids, currentUserId, allConversations, blockedUsers, usersBlockedMe]);

  // Funcție pentru contraoferta din modal (păstrată pentru compatibilitate, dar nu va fi folosită)
  const handleCounterOfferFromModal = useCallback(async () => {
    if (!counterOfferModalData) return;

    const amount = parseFloat(counterOfferAmountModal);
    if (!counterOfferAmountModal || isNaN(amount) || amount <= 0) {
      showNotificationRef.current.show('error', 'Eroare', 'Te rugăm să introduci o sumă validă');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Eroare', 'Trebuie să fii autentificat');
        return;
      }

      // Verifică dacă utilizatorul curent a blocat celălalt utilizator sau este blocat de acesta
      const conv = allConversations.find(c => c.productId === counterOfferModalData.productId);
      if (conv) {
        const targetUserId = conv.buyerId && conv.buyerId !== currentUserId
          ? conv.buyerId
          : conv.sellerId && conv.sellerId !== currentUserId
            ? conv.sellerId
            : null;

        if (targetUserId) {
          if (blockedUsers.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Nu poți plasa contraoferte către un utilizator pe care l-ai blocat.');
            setShowCounterOfferModal(false);
            return;
          }
          if (usersBlockedMe.has(targetUserId)) {
            showNotificationRef.current.show('error', 'Eroare', 'Acest utilizator te-a blocat și nu mai poți plasa contraoferte.');
            setShowCounterOfferModal(false);
            return;
          }
        }
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
        const result = await response.json();
        const bidId = (result as { bid?: { id?: string } })?.bid?.id;
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
        setShowCounterOfferModal(false);
        setCounterOfferModalData(null);
        setCounterOfferAmountModal('');
        await loadAllBids();
        // Nu mai afișăm modal de succes
      } else {
        const result = await response.json();
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la trimiterea contraofertei');
      }
    } catch (error: any) {
      console.error('Error placing counter offer:', error);
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [counterOfferModalData, counterOfferAmountModal, loadAllBids, currentUserId, allConversations, blockedUsers, usersBlockedMe]);

  // Plasare ofertă direct din chat (cumpărător) – inclusiv prima ofertă când nu există bids
  const handlePlaceOfferFromChat = useCallback(async (productId: string, amountRaw: string, conversationKey: string) => {
    const amount = parseFloat(amountRaw?.replace(/\s/g, '').replace(',', '.'));
    if (!amountRaw || isNaN(amount) || amount <= 0) {
      showNotificationRef.current.show('error', 'Eroare', 'Introdu o sumă validă.');
      return;
    }
    setPlacingOffer(prev => ({ ...prev, [conversationKey]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showNotificationRef.current.show('error', 'Eroare', 'Trebuie să fii autentificat.');
        return;
      }
      const conv = allConversations.find(c => c.productId === productId);
      if (conv) {
        const targetUserId = conv.buyerId && conv.buyerId !== currentUserId ? conv.buyerId : conv.sellerId;
        if (targetUserId && (blockedUsers.has(targetUserId) || usersBlockedMe.has(targetUserId))) {
          showNotificationRef.current.show('error', 'Eroare', 'Nu poți plasa oferte în acest chat.');
          return;
        }
      }
      const response = await dashboardApiFetch('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_id: productId, amount }),
      });
      if (response.ok) {
        const result = await response.json();
        const bidId = (result as { bid?: { id?: string } })?.bid?.id;
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
        setPlaceOfferAmount(prev => ({ ...prev, [conversationKey]: '' }));
        await loadAllBids();
        showNotificationRef.current.show('success', 'Oferta trimisă', 'Oferta ta a fost trimisă.');
      } else {
        const result = await response.json();
        showNotificationRef.current.show('error', 'Eroare', result.error || 'Eroare la trimiterea ofertei');
      }
    } catch (e: any) {
      showNotificationRef.current.show('error', 'Eroare', 'Eroare la trimiterea ofertei: ' + (e?.message || 'Eroare necunoscută'));
    } finally {
      setPlacingOffer(prev => ({ ...prev, [conversationKey]: false }));
    }
  }, [loadAllBids, currentUserId, allConversations, blockedUsers, usersBlockedMe]);

  // Countdown pentru ofertele acceptate
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const newState: Record<string, number> = {};
        const expiredProductIds: string[] = [];

        Object.keys(prev).forEach(productId => {
          const remaining = prev[productId] - 1;
          if (remaining > 0) {
            newState[productId] = remaining;
          } else {
            // Countdown-ul s-a terminat - marchează pentru procesare
            expiredProductIds.push(productId);
          }
        });

        // Procesează ofertele expirate
        if (expiredProductIds.length > 0) {
          expiredProductIds.forEach(async (productId) => {
            const acceptedBid = acceptedBids[productId];
            if (acceptedBid) {
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session) {
                  // Marchează oferta ca is_winning = true în baza de date
                  await dashboardApiFetch('/api/bids/accept', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      product_id: productId,
                      bid_id: acceptedBid.bidId,
                    }),
                  });

                  // Trimite mesaj în chat că oferta a fost acceptată
                  const conv = allConversations.find(c => c.productId === productId);
                  if (conv) {
                    const conversationKey = conv.buyerId 
                      ? `${conv.productId}-${conv.buyerId}`
                      : `${conv.productId}-${conv.sellerId}`;
                    const chatId = chatIds[conversationKey];
                
                if (chatId) {
                  try {
                    // Marchează oferta ca is_winning = true în baza de date
                    await dashboardApiFetch('/api/bids/accept', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        product_id: productId,
                        bid_id: acceptedBid.bidId,
                      }),
                    });

                    // Trimite mesaj în chat că oferta a fost acceptată
                    const acceptedBidObj = conv.bids?.find(b => b.id === acceptedBid.bidId);
                    const bidAmount = acceptedBidObj?.amount || 0;
                    const currency = conv.product.currency || 'RON';
                    const formattedAmount = new Intl.NumberFormat('ro-RO', {
                      style: 'currency',
                      currency: currency,
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(bidAmount);
                    
                    await dashboardApiFetch('/api/product-chat/system-message', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        chatId: chatId,
                        messageText: `Oferta de ${formattedAmount} a fost acceptată!`
                      }),
                    });

                    // Verifică dacă chat-ul era blocat înainte
                    const blockState = blockedChats[conversationKey];
                    const wasBlocked = blockState?.blocked_by_seller || blockState?.blocked_by_buyer;
                    
                    if (wasBlocked) {
                      // Actualizează metadata pentru a debloca chat-ul
                      await dashboardApiFetch('/api/product-chat/update-metadata', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          chatId: chatId,
                          metadata: {
                            blocked_by_seller: false,
                            blocked_by_buyer: false
                          }
                        }),
                      });

                      // Trimite mesaj automat de deblocare doar dacă chat-ul era blocat
                      await dashboardApiFetch('/api/product-chat/system-message', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          chatId: chatId,
                          messageText: 'GoBid mesaj automat: Deoarece s-a ajuns la un consens, chat-ul este deblocat pentru comunicare.'
                        }),
                      });

                      // Actualizează state-ul local
                      setBlockedChats(prev => ({
                        ...prev,
                        [conversationKey]: {
                          blocked_by_seller: false,
                          blocked_by_buyer: false
                        }
                      }));
                    }

                    // Reîncarcă mesajele și ofertele
                    await loadChatMessages(conv.productId, conv.sellerId, conv.buyerId);
                    await loadAllBids();
                  } catch (error) {
                    console.error('Error finalizing accept after countdown:', error);
                  }
                }
                  }
                }
              } catch (error) {
                console.error('Error finalizing accept on countdown expiry:', error);
              }
            }
          });
        }

        return Object.keys(newState).length > 0 ? newState : {};
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [acceptedBids, allConversations, chatIds, blockedChats, loadChatMessages, loadAllBids]);

  const selectedConv = selectedConversation 
    ? allConversations.find(c => 
        c.productId === selectedConversation.productId && 
        c.sellerId === selectedConversation.sellerId &&
        c.buyerId === selectedConversation.buyerId // Include buyerId pentru identificare unică
      )
    : null;
  
  const selectedReportChatData = selectedReportChat
    ? reportChats.find(c => c.id === selectedReportChat && !hiddenReportChats.has(c.id))
    : null;

  // State pentru actualizare în timp real a ultimei conectări
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Actualizează timpul curent pentru recalcularea "Ultima conectare" (mai des pentru actualizări mai rapide)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000); // Actualizează la fiecare 10 secunde pentru actualizări mai rapide
    
    return () => clearInterval(interval);
  }, []);
  
  // Actualizare Realtime și periodică pentru ultima conectare
  useEffect(() => {
    if (!currentUserId || !selectedConv) return;
    
    const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
      ? selectedConv.buyerId
      : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
        ? selectedConv.sellerId
        : null;
    
    if (!targetUserId) return;
    
    console.log('[LastConnection] Setting up realtime updates for user:', targetUserId);
    
    // Funcție pentru a actualiza ultima conectare din activity logs sau last_sign_in_at
    const refreshLastConnection = async () => {
      try {
        // Încearcă să obțină ultima activitate din user_activity_logs pentru status online
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        // Verifică ultima activitate din user_activity_logs
        const { data: latestActivity } = await supabase
          .from('user_activity_logs')
          .select('created_at')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // Folosește ultima activitate dacă este mai recentă de 5 minute (utilizator online)
        let lastConnectionValue: string | null = null;
        if (latestActivity?.created_at) {
          const activityTime = new Date(latestActivity.created_at);
          const now = new Date();
          const diffMs = now.getTime() - activityTime.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          
          // Dacă activitatea este din ultimele 5 minute, utilizatorul este online
          if (diffMins < 5) {
            lastConnectionValue = latestActivity.created_at;
          }
        }
        
        // Dacă nu există activitate recentă, folosește last_sign_in_at
        if (!lastConnectionValue) {
          const verificationRes = await dashboardApiFetch(`/api/user/verification/${targetUserId}`, {
            headers: {
            }
          });
          if (verificationRes.ok) {
            const verificationData = await verificationRes.json();
            if (verificationData.lastSignInAt) {
              lastConnectionValue = verificationData.lastSignInAt;
            }
          }
        }
        
        if (lastConnectionValue) {
          setUserStats(prev => {
            if (prev[targetUserId]) {
              return {
                ...prev,
                [targetUserId]: {
                  ...prev[targetUserId],
                  lastConnection: lastConnectionValue,
                },
              };
            }
            return prev;
          });
          // Forțează actualizarea timpului curent pentru recalculare imediată
          setCurrentTime(new Date());
        }
      } catch (error) {
        console.error(`[RefreshLastConnection] Error refreshing last connection for ${targetUserId}:`, error);
      }
    };
    
    // Reîncarcă periodic fără Realtime pe user_activity_logs; tabela are volum mare și poate încărca Supabase Realtime.
    refreshLastConnection();
    const interval = setInterval(refreshLastConnection, 60000);
    
    return () => {
      clearInterval(interval);
    };
  }, [currentUserId, selectedConv]);
  
  // Auto-scroll to bottom when conversation, bids, or messages change
  useEffect(() => {
    if (selectedConv && messagesEndRef.current) {
      // Pentru user_chats folosim cheia `user-chat-${userChatId}`
      const conversationKey = selectedConv.type === 'user' && selectedConv.userChatId
        ? `user-chat-${selectedConv.userChatId}`
        : selectedConv.buyerId
          ? `${selectedConv.productId}-${selectedConv.buyerId}`
          : `${selectedConv.productId}-${selectedConv.sellerId}`;
      
      // Obține mesajele pentru conversația curentă
      const currentMessages = chatMessages[conversationKey] || [];
      
      // Folosim setTimeout pentru a ne asigura că DOM-ul este actualizat după ce mesajele sunt renderizate
      const timeoutId = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedConv, selectedConv?.bids?.length, selectedConversation, chatMessages]);

  const mobileChatOpen = !!(selectedConversation || selectedReportChatData);
  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode}/>
      
      <div className="container mx-auto max-w-7xl px-4 py-8 max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden max-md:py-0 max-md:px-0 max-md:w-full max-md:max-w-none">
        {/* Header Section - ascuns pe mobil (titlu, subtitlu, Înapoi); pe desktop rămâne */}
        <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-2 max-md:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">
              Ofertele mele
            </h1>
            <p className="text-xs md:text-sm text-gray-600">
              Toate ofertele pe care le-ai plasat
            </p>
          </div>
          <BackButton fallbackHref="/dashboard" label="Înapoi" className="shadow-md" />
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:rounded-none">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white relative max-md:flex-col max-md:flex-1 max-md:min-h-0 max-md:h-auto max-md:rounded-none h-[calc(100vh-220px)] md:h-[750px]">
            {/* Left Panel - Lista de oferte */}
            <div className={`absolute md:relative inset-0 z-10 md:z-auto w-full md:w-1/3 border-r border-gray-200 bg-white flex flex-col transition-transform duration-300 ${
              selectedConv ? 'translate-x-[-100%] md:translate-x-0' : 'translate-x-0'
            }`}>
              {/* Header lista */}
              <div className="p-4 border-b border-gray-200 bg-white flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="md:hidden flex-shrink-0 -ml-1">
                    <BackButton fallbackHref="/dashboard" label="Înapoi" className="h-9 min-h-0 px-2 shadow-sm" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 truncate">
                    Ofertele mele
                  </h2>
                </div>
                <button
                  onClick={async () => {
                    console.log('🔄 [Manual Refresh] Refreshing messages...');
                    if (selectedConversation) {
                      if (selectedConversation.type === 'user' && selectedConversation.userChatId) {
                        await loadUserChatMessages(selectedConversation.userChatId);
                      } else if (selectedConversation.productId) {
                        await loadChatMessages(
                          selectedConversation.productId,
                          selectedConversation.sellerId,
                          selectedConversation.buyerId
                        );
                      }
                      console.log('✅ [Manual Refresh] Messages refreshed');
                    }
                    await loadAllBids();
                    console.log('✅ [Manual Refresh] All bids refreshed');
                  }}
                  className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 group"
                  title="Reîmprospătează mesajele"
                >
                  <svg 
                    className="w-5 h-5 text-gray-600 group-hover:text-blue-600 transition-colors" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                    />
                  </svg>
                </button>
              </div>
              
              {/* Lista oferte */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {loadingBids ? (
                  <div className="p-4 text-center flex-1 flex flex-col items-center justify-center min-h-[200px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Se încarcă ofertele...</p>
                  </div>
                ) : (
                  <>
                    {/* Conversații de rapoarte */}
                    {reportChats.length > 0 && (
                      <div className="border-b border-gray-200 pb-2 mb-2">
                        {reportChats.map((reportChat) => {
                          const report = reportChat.user_reports;
                          const chatKey = `report-${reportChat.id}`;
                          const isSelected = selectedReportChat === reportChat.id;
                          const messages = reportChatMessages[reportChat.id] || [];
                          const unreadCount = messages.filter(m => !m.is_read && m.sender_user_id !== currentUserId).length;
                          const hasUnread = unreadCount > 0;
                          const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

                          // Verifică dacă conversația de raportare este ascunsă
                          if (hiddenReportChats.has(reportChat.id)) return null;

                          return (
                            <div
                              key={chatKey}
                              onClick={() => {
                                if (swipedReportChat === reportChat.id && Math.abs(swipeReportOffset) > 50) {
                                  // Dacă este swiped, nu deschide conversația
                                  return;
                                }
                                setSelectedReportChat(reportChat.id);
                                setSelectedConversation(null); // Resetează selecția conversației de produs
                                setSwipedReportChat(null);
                                setSwipeReportOffset(0);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, conversationKey: chatKey });
                              }}
                              onTouchStart={(e) => {
                                setSwipeReportStartX(e.touches[0].clientX);
                              }}
                              onTouchMove={(e) => {
                                if (swipeReportStartX === null) return;
                                const currentX = e.touches[0].clientX;
                                const diff = swipeReportStartX - currentX;
                                if (diff > 0) {
                                  setSwipedReportChat(reportChat.id);
                                  setSwipeReportOffset(Math.min(diff, 80));
                                }
                              }}
                              onTouchEnd={() => {
                                if (Math.abs(swipeReportOffset) < 50) {
                                  setSwipedReportChat(null);
                                  setSwipeReportOffset(0);
                                }
                                setSwipeReportStartX(null);
                              }}
                              className={`group w-full relative overflow-hidden`}
                            >
                              {/* Buton delete pentru swipe left (mobil) */}
                              <div 
                                className={`absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex items-center justify-center z-10 transition-transform duration-300 ${
                                  swipedReportChat === reportChat.id && swipeReportOffset > 50
                                    ? 'translate-x-0'
                                    : 'translate-x-full'
                                }`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('🗑️ [DELETE BUTTON] Report chat delete clicked:', reportChat.id);
                                    setDeleteConversationKey(reportChat.id);
                                    setDeleteConversationIsReport(true);
                                    setShowDeleteConversationModal(true);
                                    setSwipedReportChat(null);
                                    setSwipeReportOffset(0);
                                  }}
                                  className="p-4 text-white"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>

                              {/* Conținut conversație de raportare cu transform pentru swipe */}
                              <div
                                className={`p-3 border-b border-gray-100 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm text-left cursor-pointer ${
                                  isSelected 
                                    ? 'bg-blue-50 border-l-4 border-l-blue-400' 
                                    : 'bg-white'
                                } ${
                                  swipedReportChat === reportChat.id && swipeReportOffset > 50
                                    ? 'transform -translate-x-20'
                                    : ''
                                }`}
                              >
                              <div className="flex items-center gap-3">
                                {/* Avatar "Raportare Useri" */}
                                <div className="flex-shrink-0 relative">
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500">
                                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" stroke="white" strokeWidth="2.5"/>
                                      <circle cx="12" cy="16" r="1" fill="white"/>
                                    </svg>
                                  </div>
                                  {hasUnread && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white animate-pulse"></div>
                                  )}
                                </div>

                                {/* Info conversație raport */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <p className={`text-sm font-medium truncate ${hasUnread ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>
                                        Raportare Useri
                                      </p>
                                      {hasUnread && (
                                        <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                                          {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                      )}
                                    </div>
                                    {latestMessage && (
                                      <span className="text-xs flex-shrink-0 text-gray-500">
                                        {(() => {
                                          const date = new Date(latestMessage.created_at);
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
                                    {report?.product_title || 'Raport utilizator'}
                                  </p>
                                  {latestMessage && (
                                    <p className="text-sm truncate text-gray-700">
                                      {latestMessage.message_text.substring(0, 50)}{latestMessage.message_text.length > 50 ? '...' : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Conversații de produse */}
                    {(() => {
                      const selectedConv = selectedConversation
                        ? allConversations.find(
                            c => c.productId === selectedConversation.productId
                              && (selectedConversation.buyerId ? c.buyerId === selectedConversation.buyerId : c.sellerId === selectedConversation.sellerId)
                          )
                        : null;
                      console.log('🎨 [JSX Render] Checking conversations to render:', {
                        allConversationsLength: allConversations.length,
                        selectedConversation: selectedConversation ? {
                          productId: selectedConversation.productId,
                          productTitle: selectedConv?.product?.title,
                          buyerId: selectedConversation.buyerId,
                          sellerId: selectedConversation.sellerId
                        } : null,
                        sampleConversations: allConversations.slice(0, 3).map(c => ({
                          productId: c.productId,
                          title: c.product?.title,
                          type: c.type
                        }))
                      });
                      return null;
                    })()}
                    {allConversations.length === 0 ? (
                      <div className={`flex-1 flex flex-col items-center justify-center min-h-[min(280px,50vh)] sm:min-h-[320px] px-6 py-10 text-center ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50/80'}`}>
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                          <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className={`text-lg sm:text-xl font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          Nu ai nicio ofertă
                        </h3>
                        <p className={`text-sm sm:text-base max-w-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Când primești oferte pe produsele tale, le vei vedea aici.
                        </p>
                      </div>
                    ) : (
                      (() => {
                        // Sortează conversațiile: cele fixate primele (respectând ordinea din pinnedConversations), apoi restul după cel mai nou mesaj/ofertă
                        console.log('🔄 [JSX Sort] Sorting conversations in UI...');
                        const sortedConversations = [...allConversations].sort((a, b) => {
                      const keyA = a.buyerId 
                        ? `${a.productId}-${a.buyerId}`
                        : `${a.productId}-${a.sellerId}`;
                      const keyB = b.buyerId 
                        ? `${b.productId}-${b.buyerId}`
                        : `${b.productId}-${b.sellerId}`;
                      
                      const isPinnedA = pinnedConversations.includes(keyA);
                      const isPinnedB = pinnedConversations.includes(keyB);
                      
                      // Cele fixate primele (respectând ordinea din pinnedConversations)
                      if (isPinnedA && !isPinnedB) return -1;
                      if (!isPinnedA && isPinnedB) return 1;
                      
                      // Dacă ambele sunt fixate, respectă ordinea din pinnedConversations
                      if (isPinnedA && isPinnedB) {
                        const indexA = pinnedConversations.indexOf(keyA);
                        const indexB = pinnedConversations.indexOf(keyB);
                        return indexA - indexB;
                      }
                      
                      // Pentru celelalte, sortează după cel mai nou mesaj sau ofertă
                      // Calculează cel mai nou timestamp pentru conversația A
                      let latestTimestampA = 0;
                      if (a.type === 'user') {
                        // Pentru user_chats, folosește lastMessageAt direct
                        latestTimestampA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                      } else {
                        // Pentru product_chats, logica existentă
                        const messagesA = chatMessages[keyA] || [];
                        const latestMessageA = messagesA.length > 0 
                          ? messagesA.reduce((latest, msg) => {
                              const msgTime = new Date(msg.created_at).getTime();
                              const latestTime = latest ? new Date(latest.created_at).getTime() : 0;
                              return msgTime > latestTime ? msg : latest;
                            }, null as any)?.created_at
                          : null;
                        const latestBidA = a.latestBid?.created_at || null;
                        
                        if (latestMessageA && latestBidA) {
                          latestTimestampA = Math.max(
                            new Date(latestMessageA).getTime(),
                            new Date(latestBidA).getTime()
                          );
                        } else if (latestMessageA) {
                          latestTimestampA = new Date(latestMessageA).getTime();
                        } else if (latestBidA) {
                          latestTimestampA = new Date(latestBidA).getTime();
                        }
                        
                        // Log special pentru conversația cu iPhone-ul
                        if (a.product?.title?.toLowerCase().includes('iphone') && 
                            a.product?.title?.toLowerCase().includes('alb')) {
                          console.log('📱 [JSX Sort] iPhone alb timestamp:', {
                            productTitle: a.product.title,
                            latestTimestampA,
                            latestMessageA,
                            latestBidA,
                            bidsCount: a.bids?.length
                          });
                        }
                      }
                      
                      // Calculează cel mai nou timestamp pentru conversația B
                      let latestTimestampB = 0;
                      if (b.type === 'user') {
                        // Pentru user_chats, folosește lastMessageAt direct
                        latestTimestampB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                      } else {
                        // Pentru product_chats, logica existentă
                        const messagesB = chatMessages[keyB] || [];
                        const latestMessageB = messagesB.length > 0 
                          ? messagesB.reduce((latest, msg) => {
                              const msgTime = new Date(msg.created_at).getTime();
                              const latestTime = latest ? new Date(latest.created_at).getTime() : 0;
                              return msgTime > latestTime ? msg : latest;
                            }, null as any)?.created_at
                          : null;
                        const latestBidB = b.latestBid?.created_at || null;
                        
                        if (latestMessageB && latestBidB) {
                          latestTimestampB = Math.max(
                            new Date(latestMessageB).getTime(),
                            new Date(latestBidB).getTime()
                          );
                        } else if (latestMessageB) {
                          latestTimestampB = new Date(latestMessageB).getTime();
                        } else if (latestBidB) {
                          latestTimestampB = new Date(latestBidB).getTime();
                        }
                      }
                      
                      // Sortează după cel mai nou (descrescător - cel mai nou primul)
                      return latestTimestampB - latestTimestampA;
                    });
                    
                    console.log('✅ [JSX Sort] Top 5 after sorting:', 
                      sortedConversations.slice(0, 5).map(c => ({
                        productTitle: c.product?.title,
                        latestBidDate: c.latestBid?.created_at,
                        type: c.type
                      }))
                    );
                    
                    console.log('📋 [JSX Sort] About to render conversations:', {
                      total: sortedConversations.length,
                      productConversations: sortedConversations.filter(c => c.type === 'product').length,
                      userConversations: sortedConversations.filter(c => c.type === 'user').length,
                      hiddenConversationsCount: hiddenConversations.size,
                      hiddenKeys: Array.from(hiddenConversations)
                    });
                    
                    return sortedConversations.map((conv, index) => {
                      // Generate unique key: for received bids (user is seller), use buyerId; for made bids (user is buyer), use sellerId
                      const uniqueKey = conv.buyerId 
                        ? `${conv.productId}-${conv.buyerId}` // Received bids: productId-buyerId
                        : `${conv.productId}-${conv.sellerId}`; // Made bids: productId-sellerId
                      
                      // Verifică dacă această conversație este selectată folosind uniqueKey
                      const selectedUniqueKey = selectedConversation 
                        ? (() => {
                            // Folosește direct buyerId din selectedConversation pentru identificare unică
                            return selectedConversation.buyerId 
                              ? `${selectedConversation.productId}-${selectedConversation.buyerId}`
                              : `${selectedConversation.productId}-${selectedConversation.sellerId}`;
                          })()
                        : null;
                      const isSelected = selectedUniqueKey === uniqueKey;
                      
                      // Log pentru primele 5 conversații SAU pentru conversația selectată
                      if (index < 5 || isSelected) {
                        console.log(`🎯 [JSX Render #${index}] Rendering conversation:`, {
                          uniqueKey,
                          productTitle: conv.product?.title,
                          isSelected,
                          selectedUniqueKey,
                          matches: selectedUniqueKey === uniqueKey ? 'YES' : 'NO'
                        });
                      }
                      
                      const sellerName = conv.sellerInfo?.first_name && conv.sellerInfo?.last_name
                        ? `${conv.sellerInfo.first_name} ${conv.sellerInfo.last_name}`
                        : conv.sellerInfo?.username || conv.sellerInfo?.email || 'Vânzător';
                      
                      // Verifică dacă există mesaje necitite pentru această conversație
                      const unreadCount = unreadCounts[uniqueKey] || 0;
                      const hasUnread = unreadCount > 0;
                      const isPinned = pinnedConversations.includes(uniqueKey);
                      const isFavorite = favoriteConversations.has(uniqueKey);
                      
                      // Verifică dacă există o ofertă primită fără contraoferta
                      let hasUnansweredOffer = false;
                      if (conv.bids && conv.bids.length > 0) {
                        // Sortează ofertele după dată
                        const sortedBids = [...conv.bids].sort((a, b) => 
                          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        );
                        
                        // Găsește ultima ofertă
                        const lastBid = sortedBids[sortedBids.length - 1];
                        
                        // Dacă user-ul este seller (are buyerId), verifică dacă ultima ofertă este de la buyer și nu are contraoferta
                        if (conv.buyerId && lastBid.user_id === conv.buyerId && lastBid.user_id !== currentUserId) {
                          // Verifică dacă există o ofertă ulterioară de la seller (contraoferta)
                          const hasCounterOffer = sortedBids.some(bid => 
                            bid.user_id === currentUserId && 
                            new Date(bid.created_at).getTime() > new Date(lastBid.created_at).getTime()
                          );
                          // Verifică dacă oferta este acceptată
                          const isAccepted = lastBid.is_winning === true;
                          hasUnansweredOffer = !hasCounterOffer && !isAccepted;
                        }
                        // Dacă user-ul este buyer (nu are buyerId), verifică dacă ultima ofertă este de la seller și nu are contraoferta
                        else if (!conv.buyerId && lastBid.user_id === conv.sellerId && lastBid.user_id !== currentUserId) {
                          // Verifică dacă există o ofertă ulterioară de la buyer (contraoferta)
                          const hasCounterOffer = sortedBids.some(bid => 
                            bid.user_id === currentUserId && 
                            new Date(bid.created_at).getTime() > new Date(lastBid.created_at).getTime()
                          );
                          // Verifică dacă oferta este acceptată
                          const isAccepted = lastBid.is_winning === true;
                          hasUnansweredOffer = !hasCounterOffer && !isAccepted;
                        }
                      }
                      
                      // Calculează poziția în lista de conversații fixate
                      let pinPosition: number | null = null;
                      if (isPinned) {
                        pinPosition = pinnedConversations.indexOf(uniqueKey) + 1;
                      }
                      
                      // Verifică dacă conversația este ascunsă
                      if (hiddenConversations.has(uniqueKey)) {
                        if (index < 3) {
                          console.log(`🚫 [JSX Render #${index}] Conversation HIDDEN:`, {
                            uniqueKey,
                            productTitle: conv.product?.title
                          });
                        }
                        return null;
                      }

                      return (
                        <div
                          key={uniqueKey}
                          data-conversation-key={uniqueKey}
                          draggable={isPinned}
                          onDragStart={(e) => isPinned && handleDragStart(e, uniqueKey)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => isPinned && handleDragOver(e, uniqueKey)}
                          onDrop={(e) => isPinned && handleDrop(e, uniqueKey)}
                          onClick={() => {
                            if (swipedConversation === uniqueKey && Math.abs(swipeOffset) > 50) {
                              // Dacă este swiped, nu deschide conversația
                              return;
                            }
                            setSelectedConversation({ 
                              type: conv.type || 'product',
                              productId: conv.type === 'user' ? undefined : conv.productId, // Nu seta productId pentru user_chats
                              sellerId: conv.sellerId,
                              buyerId: conv.buyerId, // Include buyerId pentru identificare unică
                              userChatId: conv.userChatId // Include userChatId pentru user_chats
                            });
                            setSelectedReportChat(null); // Resetează selecția conversației de raport
                            setSwipedConversation(null);
                            setSwipeOffset(0);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, conversationKey: uniqueKey });
                          }}
                          onTouchStart={(e) => {
                            setSwipeStartX(e.touches[0].clientX);
                          }}
                          onTouchMove={(e) => {
                            if (swipeStartX === null) return;
                            const currentX = e.touches[0].clientX;
                            const diff = swipeStartX - currentX;
                            if (diff > 0) {
                              setSwipedConversation(uniqueKey);
                              setSwipeOffset(Math.min(diff, 80));
                            }
                          }}
                          onTouchEnd={() => {
                            if (Math.abs(swipeOffset) < 50) {
                              setSwipedConversation(null);
                              setSwipeOffset(0);
                            }
                            setSwipeStartX(null);
                          }}
                          className={`group w-full relative overflow-hidden ${
                            isPinned ? 'cursor-move' : ''
                          } ${
                            draggedOverKey === uniqueKey ? 'border-t-2 border-blue-500' : ''
                          }`}
                        >
                          {/* Buton delete pentru swipe left (mobil) */}
                          <div 
                            className={`absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex items-center justify-center z-10 transition-transform duration-300 ${
                              swipedConversation === uniqueKey && swipeOffset > 50
                                ? 'translate-x-0'
                                : 'translate-x-full'
                            }`}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConversationKey(uniqueKey);
                                setDeleteConversationIsReport(false);
                                setShowDeleteConversationModal(true);
                                setSwipedConversation(null);
                                setSwipeOffset(0);
                              }}
                              className="p-4 text-white"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          {/* Conținut conversație cu transform pentru swipe */}
                          <div
                            className={`p-3 border-b border-gray-100 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm text-left cursor-pointer ${
                              isSelected 
                                ? (conv.type === 'user' 
                                    ? 'bg-blue-50 border-l-4 border-l-blue-400'  // MOV pentru user_chats
                                    : 'bg-blue-50 border-l-4 border-l-blue-400')     // ALBASTRU pentru product_chats
                                : isFavorite 
                                  ? 'bg-gradient-to-r from-yellow-50 via-yellow-100/50 to-yellow-50 border-l-4 border-l-yellow-400' 
                                  : 'bg-white'
                            } ${
                              swipedConversation === uniqueKey && swipeOffset > 50
                                ? 'transform -translate-x-20'
                                : ''
                            }`}
                          >
                          <div className="flex items-center gap-3 relative">
                          {/* Avatar vânzător */}
                          <div className={`flex-shrink-0 relative ${isFavorite ? 'ring-2 ring-yellow-400 ring-offset-2 rounded-full' : ''}`}>
                            {conv.sellerInfo?.avatar_url ? (
                              <img
                                src={conv.sellerInfo.avatar_url}
                                alt={sellerName}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold bg-gray-200 text-gray-700">
                                {(conv.sellerInfo?.first_name?.[0] || conv.sellerInfo?.username?.[0] || 'V').toUpperCase()}
                              </div>
                            )}
                            {hasUnread && (
                              <>
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white animate-pulse"></div>
                                {unreadCount > 1 && (
                                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                    <span className="text-[8px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
                                  </div>
                                )}
                              </>
                            )}
                            {/* Punct roșu pentru oferte primite fără contraoferta */}
                            {hasUnansweredOffer && !isSelected && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
                            )}
                          </div>
                          
                          {/* Info conversație */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${hasUnread ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>
                                  {sellerName}
                                </p>
                                {hasUnread && (
                                  <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                  </span>
                                )}
                                {/* Badge pentru conversații user_chats */}
                                {conv.type === 'user' && (
                                  <span className="flex-shrink-0 bg-blue-100 text-blue-600 text-xs font-medium px-2 py-0.5 rounded-full">
                                    Chat
                                  </span>
                                )}
                              </div>
                              {conv.type === 'user' && conv.lastMessageAt ? (
                                <span className="text-xs flex-shrink-0 text-gray-500">
                                  {(() => {
                                    const date = new Date(conv.lastMessageAt);
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
                              ) : (
                                conv.latestBid && (
                                  <span className="text-xs flex-shrink-0 text-gray-500">
                                    {(() => {
                                      const date = new Date(conv.latestBid.created_at);
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
                                )
                              )}
                            </div>
                            {/* Pentru user_chats, arată preview mesaj; pentru product_chats, arată titlul produsului */}
                            <p className="text-xs truncate mb-1 text-gray-600 block">
                              {conv.type === 'user' 
                                ? (conv.lastMessage || 'Niciun mesaj încă') 
                                : conv.product.title
                              }
                            </p>
                            {conv.type !== 'user' && conv.latestBid && (
                              <div className="flex items-center gap-2">
                                {/* Preț original cu strikethrough (dacă există și este diferit de ofertă) */}
                                {conv.product.startingPrice && conv.product.startingPrice !== conv.latestBid.amount && (
                                  <span className="text-sm text-gray-400 line-through">
                                    {formatPrice(conv.product.startingPrice, conv.product.currency)}
                                  </span>
                                )}
                                {/* Preț nou (oferta) */}
                                <span className={`text-sm font-bold ${
                                  conv.latestBid.is_winning 
                                    ? 'text-green-600' 
                                    : 'text-gray-900'
                                }`}>
                                  {formatPrice(conv.latestBid.amount, conv.product.currency)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        </div>
                      </div>
                    );
                  })
                      })()
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Context Menu (click dreapta) */}
            {contextMenu && (
              <div
                className="fixed z-[10000] bg-white rounded-lg shadow-2xl border border-gray-200 py-2 min-w-[200px]"
                style={{
                  left: `${contextMenu.x}px`,
                  top: `${contextMenu.y}px`,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Opțiune Urmărește - urmărește utilizatorul, nu produsul */}
                {!contextMenu.conversationKey.startsWith('report-') && (() => {
                  // Găsește conversația și extrage targetUserId
                  const conv = allConversations.find(c => {
                    const key = c.buyerId 
                      ? `${c.productId}-${c.buyerId}`
                      : `${c.productId}-${c.sellerId}`;
                    return key === contextMenu.conversationKey;
                  });

                  if (!conv || !currentUserId) return null;

                  const targetUserId = conv.buyerId && conv.buyerId !== currentUserId
                    ? conv.buyerId
                    : conv.sellerId && conv.sellerId !== currentUserId
                      ? conv.sellerId
                      : null;

                  if (!targetUserId) return null;

                  const isFollowing = followingUsers.has(targetUserId);

                  return (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (targetUserId && currentUserId) {
                          try {
                            const { data: sessionData } = await supabase.auth.getSession();
                            if (!sessionData.session) {
                              showNotificationRef.current.show('error', 'Eroare', 'Te rugăm să te autentifici');
                              setContextMenu(null);
                              return;
                            }

                            if (isFollowing) {
                              // Unfollow user
                              const response = await dashboardApiFetch(`/api/user/follow?followedUserId=${targetUserId}`, {
                                method: 'DELETE',
                                headers: {
                                },
                              });

                              if (response.ok) {
                                setFollowingUsers(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(targetUserId);
                                  return newSet;
                                });
                                showNotificationRef.current.show('success', 'Succes', 'Nu mai urmăriți acest utilizator');
                              } else {
                                showNotificationRef.current.show('error', 'Eroare', 'Eroare la oprirea urmăririi');
                              }
                            } else {
                              // Follow user
                              const response = await dashboardApiFetch('/api/user/follow', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ followedUserId: targetUserId }),
                              });

                              if (response.ok) {
                                setFollowingUsers(prev => new Set(prev).add(targetUserId));
                                showNotificationRef.current.show('success', 'Succes', 'Urmăriți acest utilizator');
                              } else {
                                showNotificationRef.current.show('error', 'Eroare', 'Eroare la urmărire');
                              }
                            }
                          } catch (error: any) {
                            console.error('Error toggling follow:', error);
                            showNotificationRef.current.show('error', 'Eroare', 'Eroare la actualizarea urmăririi');
                          }
                        }
                        setContextMenu(null);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-blue-50 transition-colors"
                    >
                      <svg 
                        className={`w-5 h-5 ${isFollowing ? 'text-blue-600' : 'text-gray-500'}`} 
                        fill={isFollowing ? 'currentColor' : 'none'}
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {/* Icon cu două persoane pentru follow */}
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span className={`text-sm font-medium ${isFollowing ? 'text-blue-600' : 'text-gray-700'}`}>
                        {isFollowing ? 'Nu mai urmări' : 'Urmărește'}
                      </span>
                    </button>
                  );
                })()}

                {/* Opțiune Favorit */}
                {!contextMenu.conversationKey.startsWith('report-') && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(contextMenu.conversationKey, e);
                        setContextMenu(null);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-yellow-50 transition-colors border-t border-gray-100"
                    >
                      <svg 
                        className="w-5 h-5" 
                        xmlns="http://www.w3.org/2000/svg"
                        fill={favoriteConversations.has(contextMenu.conversationKey) ? '#fbbf24' : 'none'}
                        stroke={favoriteConversations.has(contextMenu.conversationKey) ? '#fbbf24' : '#9ca3af'}
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className={`text-sm font-medium ${favoriteConversations.has(contextMenu.conversationKey) ? 'text-yellow-600' : 'text-gray-700'}`}>
                        {favoriteConversations.has(contextMenu.conversationKey) ? 'Elimină din favorite' : 'Adaugă la favorite'}
                      </span>
                    </button>
                    
                    {/* Opțiune Mută sus */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(contextMenu.conversationKey, e);
                        setContextMenu(null);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-blue-50 transition-colors border-t border-gray-100"
                    >
                      <svg 
                        className="w-5 h-5" 
                        xmlns="http://www.w3.org/2000/svg"
                        fill={pinnedConversations.includes(contextMenu.conversationKey) ? '#3b82f6' : 'none'}
                        stroke={pinnedConversations.includes(contextMenu.conversationKey) ? '#3b82f6' : '#9ca3af'}
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                      <span className={`text-sm font-medium ${pinnedConversations.includes(contextMenu.conversationKey) ? 'text-blue-600' : 'text-gray-700'}`}>
                        {pinnedConversations.includes(contextMenu.conversationKey) ? 'Anulează fixarea' : 'Mută sus'}
                      </span>
                    </button>
                  </>
                )}
                
                {/* Opțiune Șterge */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Verifică dacă este conversație de raportare sau conversație normală
                    if (contextMenu.conversationKey.startsWith('report-')) {
                      // Este conversație de raportare - afișează modal de confirmare
                      const chatId = contextMenu.conversationKey.replace('report-', '');
                      setDeleteConversationKey(chatId);
                      setDeleteConversationIsReport(true);
                      setShowDeleteConversationModal(true);
                    } else {
                      // Este conversație normală - afișează modal de confirmare
                      setDeleteConversationKey(contextMenu.conversationKey);
                      setDeleteConversationIsReport(false);
                      setShowDeleteConversationModal(true);
                    }
                    setContextMenu(null);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-red-50 text-red-600 transition-colors border-t border-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-sm font-medium">Șterge conversație</span>
                </button>
              </div>
            )}
            
            {/* Right Panel - Detalii pentru oferta selectată */}
            {selectedReportChatData ? (
              <div className="absolute md:relative inset-0 z-20 md:z-auto w-full md:flex-1 flex flex-col min-h-0 bg-white max-md:relative max-md:flex-1 max-md:min-h-0">
                {/* Header conversație raport */}
                <div className="p-2 md:p-4 border-b border-gray-200 bg-white relative">
                  <div className="flex items-center md:justify-between">
                    {/* Buton înapoi pe mobil */}
                    <button
                      onClick={() => {
                        setSelectedReportChat(null);
                        setSelectedConversation(null);
                      }}
                      className="md:hidden mr-1.5 p-3 rounded-lg hover:bg-gray-100 transition-colors"
                      aria-label="Înapoi la listă"
                    >
                      <svg className="w-7 h-7 text-gray-700" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* Avatar și nume "Raportare Useri" */}
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-red-500">
                          <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" stroke="white" strokeWidth="2.5"/>
                            <circle cx="12" cy="16" r="1" fill="white"/>
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">Raportare Useri</h2>
                        <p className="text-xs md:text-sm text-gray-500 truncate">
                          {selectedReportChatData.user_reports?.product_title || 'Raport utilizator'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mesajele din conversație */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {(selectedReportChat ? (reportChatMessages[selectedReportChat] || []) : []).map((msg) => {
                    const isSystemMessage = msg.is_system_message === true || msg.sender_user_id === null;
                    const isMyMessage = msg.sender_user_id === currentUserId;
                    const isAdminMessage = msg.is_admin === true;
                    
                    // Nume pentru mesajele utilizatorului
                    const userName = currentUserProfile?.first_name && currentUserProfile?.last_name
                      ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
                      : currentUserProfile?.username || currentUserProfile?.email?.split('@')[0] || 'Utilizator';
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        {isSystemMessage ? (
                          <div className="flex justify-center my-3 w-full">
                            <div className="inline-flex flex-col items-center gap-2 max-w-[85%]">
                              <div className="relative group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200/50 shadow-sm text-center">
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.message_text}</p>
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(msg.created_at).toLocaleString('ro-RO', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex gap-2 max-w-[70%] ${isMyMessage ? 'flex-row-reverse' : ''}`}>
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                              {isAdminMessage ? (
                                // Avatar "Raportare Useri" pentru admin
                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500">
                                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" stroke="white" strokeWidth="2.5"/>
                                    <circle cx="12" cy="16" r="1" fill="white"/>
                                  </svg>
                                </div>
                              ) : (
                                // Avatar utilizator
                                currentUserProfile?.avatar_url ? (
                                  <img
                                    src={currentUserProfile.avatar_url}
                                    alt={userName}
                                    className="w-8 h-8 rounded-full object-cover border-2 border-blue-200"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                  />
                                ) : null
                              )}
                              {!isAdminMessage && !currentUserProfile?.avatar_url && (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-blue-500 text-white">
                                  {(currentUserProfile?.first_name?.[0] || currentUserProfile?.email?.[0] || 'U').toUpperCase()}
                                </div>
                              )}
                            </div>
                            
                            {/* Mesaj cu nume */}
                            <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                              {/* Nume */}
                              <span className={`text-xs font-medium mb-1 ${isMyMessage ? 'text-blue-600' : 'text-gray-600'}`}>
                                {isAdminMessage ? 'Raportare Useri' : userName}
                              </span>
                              
                              {/* Bula mesajului */}
                              <div className={`relative px-4 py-2 rounded-lg ${isMyMessage ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                                <span className={`text-xs mt-1 block ${isMyMessage ? 'text-blue-100' : 'text-gray-500'}`}>
                                  {new Date(msg.created_at).toLocaleTimeString('ro-RO', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input pentru mesaje */}
                <div
                  className="p-3 border-t border-gray-200 bg-white"
                  style={{ paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px) + ${mobileBottomInset}px)` }}
                >
                  <div className="flex items-center gap-1 min-w-0 w-full">
                    <input
                      type="text"
                      value={newCounterOfferAmount[`report-${selectedReportChat}`] || ''}
                      onChange={(e) => {
                        setNewCounterOfferAmount(prev => ({
                          ...prev,
                          [`report-${selectedReportChat}`]: e.target.value
                        }));
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          const messageText = newCounterOfferAmount[`report-${selectedReportChat}`] || '';
                          if (messageText.trim()) {
                            try {
                              const { data: sessionData } = await supabase.auth.getSession();
                              if (!sessionData.session) return;

                              const response = await dashboardApiFetch('/api/report-chat/messages', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  chatId: selectedReportChat,
                                  messageText: messageText.trim(),
                                  isSystemMessage: false
                                }),
                              });

                              if (response.ok) {
                                if (selectedReportChat) {
                                  setNewCounterOfferAmount(prev => ({
                                    ...prev,
                                    [`report-${selectedReportChat}`]: ''
                                  }));
                                  await loadReportChatMessages(selectedReportChat);
                                }
                                // Scroll la ultimul mesaj
                                setTimeout(() => {
                                  if (messagesEndRef.current) {
                                    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }, 100);
                              }
                            } catch (error) {
                              console.error('[Send Report Message] Error:', error);
                            }
                          }
                        }
                      }}
                      placeholder="Scrie un mesaj aici..."
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      onClick={async () => {
                        const messageText = newCounterOfferAmount[`report-${selectedReportChat}`] || '';
                        if (messageText.trim()) {
                          try {
                            const { data: sessionData } = await supabase.auth.getSession();
                            if (!sessionData.session) return;

                            const response = await dashboardApiFetch('/api/report-chat/messages', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                chatId: selectedReportChat,
                                messageText: messageText.trim(),
                                isSystemMessage: false
                              }),
                            });

                            if (response.ok && selectedReportChat) {
                              setNewCounterOfferAmount(prev => ({
                                ...prev,
                                [`report-${selectedReportChat}`]: ''
                              }));
                              await loadReportChatMessages(selectedReportChat);
                              setTimeout(() => {
                                if (messagesEndRef.current) {
                                  messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                                }
                              }, 100);
                            }
                          } catch (error) {
                            console.error('[Send Report Message] Error:', error);
                          }
                        }
                      }}
                      disabled={!selectedReportChat || !newCounterOfferAmount[`report-${selectedReportChat}`]?.trim()}
                      className="flex-shrink-0 w-15 h-15 rounded-full transition-all flex items-center justify-center bg-transparent hover:scale-105 active:scale-95 disabled:opacity-50"
                      style={{ width: '60px', height: '60px' }}
                      title="Trimite mesaj"
                    >
                      <i className={`ri-send-plane-fill text-3xl transition-colors ${
                        newCounterOfferAmount[`report-${selectedReportChat}`]?.trim()
                          ? 'text-blue-500'
                          : 'text-gray-400'
                      }`}></i>
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedConv ? (
              <div className="absolute md:relative inset-0 z-20 md:z-auto w-full md:flex-1 flex flex-col min-h-0 bg-white max-md:relative max-md:flex-1 max-md:min-h-0 overflow-x-hidden">
                <>
                  {/* Header conversație */}
                  <div className="p-2 border-b border-gray-200 bg-white relative">
                    <div className="flex items-center md:justify-between">
                      {/* Buton înapoi pe mobil */}
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="md:hidden mr-1.5 p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="Înapoi la listă"
                      >
                        <svg className="w-7 h-7 text-gray-700" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <div className="flex items-center gap-2 flex-1">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {selectedConv.sellerInfo?.avatar_url ? (
                            <img
                              src={selectedConv.sellerInfo.avatar_url}
                              alt="Utilizator"
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-gray-200 text-gray-700 border-2 border-gray-200">
                              {(selectedConv.sellerInfo?.first_name?.[0] || selectedConv.sellerInfo?.username?.[0] || selectedConv.sellerInfo?.email?.[0] || 'U').toUpperCase()}
                            </div>
                          )}
                        </div>
                        
                        {/* Nume și informații */}
                        <div className="min-w-0">
                          {(() => {
                            const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                              ? selectedConv.buyerId
                              : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                                ? selectedConv.sellerId
                                : null;
                            
                            const userName = selectedConv.sellerInfo?.first_name && selectedConv.sellerInfo?.last_name
                              ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                              : selectedConv.sellerInfo?.username || selectedConv.sellerInfo?.email || 'Vânzător';
                            
                            const stats = targetUserId ? (userStats[targetUserId] || {
                              rating: 0,
                              positivePercent: 0,
                              lastConnection: null,
                              followers: 0,
                              following: 0,
                              reviewCount: 0,
                            }) : null;
                            
                            return (
                              <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                                {targetUserId ? (
                                  <Link 
                                    href={`/user/${targetUserId}`}
                                    className="hover:underline cursor-pointer"
                                  >
                                    <span className="font-bold">{userName}</span>
                                  </Link>
                                ) : (
                                  <span>{userName}</span>
                                )}
                                {stats && (
                                  <span className="text-xs font-normal text-gray-600 ml-1">
                                    ({stats.reviewCount})
                                  </span>
                                )}
                              </h3>
                            );
                          })()}
                        
                        {/* Rating și procent pozitiv */}
                        {(() => {
                          const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                            ? selectedConv.buyerId
                            : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                              ? selectedConv.sellerId
                              : null;
                          
                          if (!targetUserId) return null;
                          
                          const stats = userStats[targetUserId] || {
                            rating: 0,
                            positivePercent: 0,
                            lastConnection: null,
                            followers: 0,
                            following: 0,
                            reviewCount: 0,
                          };
                          
                          // Format ultima conectare - folosim currentTime pentru actualizare în timp real
                          let lastConnectionText = 'Niciodată';
                          if (stats.lastConnection) {
                            const lastConn = new Date(stats.lastConnection);
                            const now = currentTime; // Folosim currentTime pentru actualizare în timp real
                            const diffMs = now.getTime() - lastConn.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            
                            if (diffMins < 1) {
                              lastConnectionText = 'acum';
                            } else if (diffMins < 60) {
                              lastConnectionText = `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                            } else if (diffHours < 24) {
                              if (diffHours === 1) {
                                lastConnectionText = 'acum 1 oră';
                              } else {
                                lastConnectionText = `acum ${diffHours} ore`;
                              }
                            } else {
                              if (diffDays === 1) {
                                lastConnectionText = 'ieri';
                              } else if (diffDays < 7) {
                                lastConnectionText = `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                              } else {
                                lastConnectionText = lastConn.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                              }
                            }
                          }
                          
                          return (
                            <div className="mt-0.5 space-y-0.5">
                              {/* Rating cu stele */}
                              <div className="flex items-center gap-1">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <svg
                                      key={star}
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill={star <= Math.round(stats.rating) ? '#fbbf24' : 'none'}
                                      stroke={star <= Math.round(stats.rating) ? '#fbbf24' : '#d1d5db'}
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                  ))}
                                </div>
                                <span className="text-xs text-gray-600">({stats.rating.toFixed(1)})</span>
                                <span className="text-xs text-gray-600">{stats.positivePercent.toFixed(1)}% pozitiv</span>
                              </div>
                              
                              {/* Urmăritori */}
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <span className="flex items-center gap-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                  </svg>
                                  {stats.followers} urmăritori
                                </span>
                                <span>,</span>
                                <span>{stats.following} urmărește</span>
                              </div>
                              
                              {/* Ultima conectare */}
                              <div className="flex items-center gap-0.5 text-xs text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/>
                                  <polyline points="12 6 12 12 16 14"/>
                                </svg>
                                <span>Ultima conectare {lastConnectionText}</span>
                              </div>
                            </div>
                          );
                        })()}
                        </div>
                      </div>
                      
                      {/* Butoane Follow, Like, Dislike - Centrate pe desktop, în dreapta pe mobil */}
                      <div className="flex absolute right-12 md:right-auto md:left-1/2 md:-translate-x-1/2 top-1/2 -translate-y-1/2 items-center gap-2">
                        {(() => {
                          // Determină utilizatorul pentru care afișăm butoanele
                          // Dacă buyerId există și este diferit de currentUserId, este cumpărătorul (utilizatorul cu care conversăm)
                          // Altfel, dacă sellerId este diferit de currentUserId, este vânzătorul (utilizatorul cu care conversăm)
                          let targetUserId: string | undefined;
                          
                          if (selectedConv.buyerId && selectedConv.buyerId !== currentUserId) {
                            // Utilizatorul curent este vânzătorul, celălalt este buyerId
                            targetUserId = selectedConv.buyerId;
                          } else if (selectedConv.sellerId && selectedConv.sellerId !== currentUserId) {
                            // Utilizatorul curent este cumpărătorul, celălalt este sellerId
                            targetUserId = selectedConv.sellerId;
                          }
                          
                          // Verifică dacă utilizatorul nu este cel curent sau dacă nu există targetUserId
                          if (!targetUserId || targetUserId === currentUserId) return null;
                          
                          const conversationKey = selectedConv.buyerId 
                            ? `${selectedConv.productId}-${selectedConv.buyerId}`
                            : `${selectedConv.productId}-${selectedConv.sellerId}`;
                          
                          const stats = userStats[targetUserId] || {
                            rating: 0,
                            positivePercent: 0,
                            lastConnection: null,
                            followers: 0,
                            following: 0,
                            reviewCount: 0,
                          };
                          
                          return (
                            <>
                              {/* Buton Follow - doar pe desktop */}
                              <div className="hidden md:flex flex-col items-center gap-1">
                                <div className="relative group">
                                  <button
                                    onClick={async () => {
                                      if (!targetUserId || !currentUserId) return;
                                      
                                      const isFollowing = followingUsers.has(targetUserId);
                                      
                                      try {
                                        const { data: sessionData } = await supabase.auth.getSession();
                                        if (!sessionData.session) return;
                                        
                                        const url = isFollowing 
                                          ? `/api/user/follow?followedUserId=${targetUserId}`
                                          : '/api/user/follow';
                                        
                                        const response = await dashboardApiFetch(url, {
                                          method: isFollowing ? 'DELETE' : 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: !isFollowing ? JSON.stringify({ followedUserId: targetUserId }) : undefined,
                                        });
                                        
                                        if (response.ok) {
                                          setFollowingUsers(prev => {
                                            const newSet = new Set(prev);
                                            if (isFollowing) {
                                              newSet.delete(targetUserId);
                                            } else {
                                              newSet.add(targetUserId);
                                            }
                                            return newSet;
                                          });
                                        }
                                      } catch (error) {
                                        console.error('Error toggling follow:', error);
                                      }
                                    }}
                                    className={`w-11 h-11 p-0 rounded-full transition-all duration-300 border-2 flex items-center justify-center overflow-visible relative ${
                                      followingUsers.has(targetUserId) 
                                        ? 'bg-blue-100 text-blue-600 border-white hover:bg-blue-200' 
                                        : 'bg-white text-gray-600 border-white hover:bg-gray-50'
                                    } hover:scale-125 hover:shadow-lg hover:shadow-blue-400/50 hover:z-50`}
                                    title={followingUsers.has(targetUserId) ? 'Nu mai urmări' : 'Urmărește'}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={followingUsers.has(targetUserId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 relative">
                                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                      <circle cx="9" cy="7" r="4"/>
                                      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                  </button>
                                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs font-medium text-gray-700 bg-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none z-50">
                                    {followingUsers.has(targetUserId) ? 'Nu mai urmări' : 'Urmărește'}
                                  </span>
                                </div>
                                <span className="text-xs font-medium text-gray-600">{stats.followers}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      
                      {/* Buton meniu */}
                      <div className="flex items-center gap-1.5 relative">
                        {/* Buton meniu */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowMobileMenu(!showMobileMenu);
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          aria-label="Meniu"
                        >
                          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setSelectedConversation(null)}
                          className="hidden md:block p-0.5 rounded hover:bg-gray-100 transition-colors"
                        >
                          <i className="ri-close-line text-base text-gray-600"></i>
                        </button>
                      </div>
                    </div>
                    
                    {/* Meniu */}
                    {showMobileMenu && (
                      <>
                        {/* Overlay transparent pentru a închide meniul când se dă click în afară */}
                        <div 
                          className="fixed inset-0 z-40"
                          onClick={() => setShowMobileMenu(false)}
                        />
                        <div 
                          className="mobile-menu-container absolute top-full right-0 z-50 bg-white border border-gray-200 shadow-lg rounded-lg min-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col py-2">
                            {/* Like / Dislike - primele pe același rând */}
                            {selectedConv && (() => {
                              const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                                ? selectedConv.buyerId
                                : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                                  ? selectedConv.sellerId
                                  : null;
                              if (!targetUserId) return null;
                              const menuLikeCount = likeCounts[targetUserId] ?? 0;
                              const menuDislikeCount = dislikeCounts[targetUserId] ?? 0;
                              return (
                                <div className="flex items-center justify-center gap-10 px-4 py-3 border-b border-gray-100">
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!targetUserId || !currentUserId) return;
                                      const alreadyLiked = likedBids.has(targetUserId);
                                      try {
                                        const { data: sessionData } = await supabase.auth.getSession();
                                        if (!sessionData.session) return;
                                        const response = await dashboardApiFetch('/api/user/reaction', {
                                          method: alreadyLiked ? 'DELETE' : 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: alreadyLiked ? undefined : JSON.stringify({ targetUserId, reactionType: 'like' }),
                                        });
                                        if (response.ok) {
                                          const result = await response.json();
                                          if (alreadyLiked || result.action === 'removed') {
                                            setLikedBids(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
                                            setLikeCounts(prev => ({ ...prev, [targetUserId]: Math.max(0, (prev[targetUserId] || 1) - 1) }));
                                          } else {
                                            setLikedBids(prev => new Set(prev).add(targetUserId));
                                            setLikeCounts(prev => ({ ...prev, [targetUserId]: (prev[targetUserId] || 0) + 1 }));
                                            if (dislikedBids.has(targetUserId)) {
                                              setDislikedBids(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
                                              setDislikeCounts(prev => ({ ...prev, [targetUserId]: Math.max(0, (prev[targetUserId] || 1) - 1) }));
                                            }
                                          }
                                        }
                                      } catch (err) { console.error('Error toggling like:', err); }
                                      setShowMobileMenu(false);
                                    }}
                                    className={`tap-bounce inline-flex flex-col items-center justify-center gap-0.5 p-2 -m-1 min-w-0 touch-manipulation select-none border-0 rounded-none bg-transparent outline-none focus:outline-none focus:ring-0 ${
                                      likedBids.has(targetUserId)
                                        ? 'text-green-600 active:bg-green-50/50'
                                        : 'text-gray-500 active:bg-gray-100/80'
                                    }`}
                                    title="Like"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill={likedBids.has(targetUserId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block shrink-0">
                                      <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-700 tabular-nums leading-none whitespace-nowrap">{menuLikeCount}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!targetUserId || !currentUserId) return;
                                      const alreadyDisliked = dislikedBids.has(targetUserId);
                                      try {
                                        const { data: sessionData } = await supabase.auth.getSession();
                                        if (!sessionData.session) return;
                                        const response = await dashboardApiFetch('/api/user/reaction', {
                                          method: alreadyDisliked ? 'DELETE' : 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: alreadyDisliked ? undefined : JSON.stringify({ targetUserId, reactionType: 'dislike' }),
                                        });
                                        if (response.ok) {
                                          const result = await response.json();
                                          if (alreadyDisliked || result.action === 'removed') {
                                            setDislikedBids(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
                                            setDislikeCounts(prev => ({ ...prev, [targetUserId]: Math.max(0, (prev[targetUserId] || 1) - 1) }));
                                          } else {
                                            setDislikedBids(prev => new Set(prev).add(targetUserId));
                                            setDislikeCounts(prev => ({ ...prev, [targetUserId]: (prev[targetUserId] || 0) + 1 }));
                                            if (likedBids.has(targetUserId)) {
                                              setLikedBids(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
                                              setLikeCounts(prev => ({ ...prev, [targetUserId]: Math.max(0, (prev[targetUserId] || 1) - 1) }));
                                            }
                                          }
                                        }
                                      } catch (err) { console.error('Error toggling dislike:', err); }
                                      setShowMobileMenu(false);
                                    }}
                                    className={`tap-bounce inline-flex flex-col items-center justify-center gap-0.5 p-2 -m-1 min-w-0 touch-manipulation select-none border-0 rounded-none bg-transparent outline-none focus:outline-none focus:ring-0 ${
                                      dislikedBids.has(targetUserId)
                                        ? 'text-red-600 active:bg-red-50/50'
                                        : 'text-gray-500 active:bg-gray-100/80'
                                    }`}
                                    title="Dislike"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill={dislikedBids.has(targetUserId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="block shrink-0" style={{ transform: 'rotate(180deg)' }}>
                                      <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-700 tabular-nums leading-none whitespace-nowrap">{menuDislikeCount}</span>
                                  </button>
                                </div>
                              );
                            })()}

                            {/* Urmărește - urmărește utilizatorul, nu produsul */}
                        {selectedConv && (() => {
                          const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                            ? selectedConv.buyerId
                            : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                              ? selectedConv.sellerId
                              : null;

                          if (!targetUserId) return null;

                          const isFollowing = followingUsers.has(targetUserId);

                          return (
                            <button
                              onClick={async () => {
                                setShowMobileMenu(false);
                                if (targetUserId && currentUserId) {
                                  try {
                                    const { data: sessionData } = await supabase.auth.getSession();
                                    if (!sessionData.session) {
                                      showNotificationRef.current.show('error', 'Eroare', 'Te rugăm să te autentifici');
                                      return;
                                    }

                                    if (isFollowing) {
                                      // Unfollow user
                                      const response = await dashboardApiFetch(`/api/user/follow?followedUserId=${targetUserId}`, {
                                        method: 'DELETE',
                                        headers: {
                                        },
                                      });

                                      if (response.ok) {
                                        setFollowingUsers(prev => {
                                          const newSet = new Set(prev);
                                          newSet.delete(targetUserId);
                                          return newSet;
                                        });
                                        showNotificationRef.current.show('success', 'Succes', 'Nu mai urmăriți acest utilizator');
                                      } else {
                                        showNotificationRef.current.show('error', 'Eroare', 'Eroare la oprirea urmăririi');
                                      }
                                    } else {
                                      // Follow user
                                      const response = await dashboardApiFetch('/api/user/follow', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ followedUserId: targetUserId }),
                                      });

                                      if (response.ok) {
                                        setFollowingUsers(prev => new Set(prev).add(targetUserId));
                                        showNotificationRef.current.show('success', 'Succes', 'Urmăriți acest utilizator');
                                      } else {
                                        showNotificationRef.current.show('error', 'Eroare', 'Eroare la urmărire');
                                      }
                                    }
                                  } catch (error: any) {
                                    console.error('Error toggling follow:', error);
                                    showNotificationRef.current.show('error', 'Eroare', 'Eroare la actualizarea urmăririi');
                                  }
                                }
                              }}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                <svg className={`w-5 h-5 ${isFollowing ? 'text-blue-600' : 'text-gray-500'}`} fill={isFollowing ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  {/* Icon cu două persoane pentru follow */}
                                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                              </div>
                              <span className={`text-base ${isFollowing ? 'text-blue-600 font-medium' : 'text-gray-900'}`}>
                                {isFollowing ? 'Nu mai urmări' : 'Urmărește'}
                              </span>
                            </button>
                          );
                        })()}

                        {/* Ajutor */}
                        <button
                          onClick={() => {
                            setShowMobileMenu(false);
                            // TODO: Implementare ajutor
                          }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <span className="text-gray-900 text-base">Ajutor</span>
                        </button>

                        {/* Adaugă la favorite / Elimină din favorite */}
                        {selectedConv && (() => {
                          const conversationKey = selectedConv.buyerId 
                            ? `${selectedConv.productId}-${selectedConv.buyerId}`
                            : `${selectedConv.productId}-${selectedConv.sellerId}`;
                          const isFavorite = favoriteConversations.has(conversationKey);

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setShowMobileMenu(false);
                                toggleFavorite(conversationKey, e);
                              }}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-yellow-50 transition-colors text-left border-t border-gray-100"
                            >
                              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                <svg 
                                  className="w-5 h-5" 
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill={isFavorite ? '#fbbf24' : 'none'}
                                  stroke={isFavorite ? '#fbbf24' : '#9ca3af'}
                                  viewBox="0 0 24 24"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                              </div>
                              <span className={`text-base ${isFavorite ? 'text-yellow-600 font-medium' : 'text-gray-900'}`}>
                                {isFavorite ? 'Elimină din favorite' : 'Adaugă la favorite'}
                              </span>
                            </button>
                          );
                        })()}

                        {/* Blocare/Deblocare */}
                        {(() => {
                          const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                            ? selectedConv.buyerId
                            : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                              ? selectedConv.sellerId
                              : null;

                          if (!targetUserId) return null;

                          const conversationKey = selectedConv.buyerId 
                            ? `${selectedConv.productId}-${selectedConv.buyerId}`
                            : `${selectedConv.productId}-${selectedConv.sellerId}`;
                          
                          const chatId = chatIds[conversationKey];
                          const isBlocked = blockedUsers.has(targetUserId);

                          return (
                            <button
                              onClick={async () => {
                                if (targetUserId && chatId) {
                                  await handleBlockUser(targetUserId, !isBlocked, conversationKey, chatId);
                                }
                              }}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-t border-gray-100"
                            >
                              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  {isBlocked ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                  ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  )}
                                </svg>
                              </div>
                              <span className="text-gray-900 text-base">{isBlocked ? 'Deblocare' : 'Blocare'}</span>
                            </button>
                          );
                        })()}

                        {/* Raportare */}
                        <button
                          onClick={() => {
                            setShowMobileMenu(false);
                            // Auto-completează formularul cu datele conversației
                            if (selectedConv) {
                              const conversationKey = selectedConv.buyerId 
                                ? `${selectedConv.productId}-${selectedConv.buyerId}`
                                : `${selectedConv.productId}-${selectedConv.sellerId}`;
                              
                              const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                                ? selectedConv.buyerId
                                : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                                  ? selectedConv.sellerId
                                  : null;
                              
                              const reportedUser = targetUserId && selectedConv.sellerInfo
                                ? (selectedConv.sellerInfo.first_name && selectedConv.sellerInfo.last_name
                                    ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                    : selectedConv.sellerInfo.username || selectedConv.sellerInfo.email || 'Utilizator')
                                : 'Utilizator necunoscut';
                              
                              const reporterName = currentUserProfile?.first_name && currentUserProfile?.last_name
                                ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
                                : currentUserProfile?.username || currentUserProfile?.email || 'Utilizator';
                              
                              setReportForm({
                                productTitle: selectedConv.product.title || '',
                                reportedUserName: reportedUser,
                                reporterName: reporterName,
                                reason: '',
                                description: '',
                                conversationId: conversationKey,
                              });
                              setShowReportModal(true);
                            }
                          }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-t border-gray-100"
                        >
                          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {/* Steagul */}
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3h10v8H5V3z" fill="currentColor" opacity="0.9"/>
                              {/* Tija steagului */}
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v18" />
                            </svg>
                          </div>
                          <span className="text-gray-900 text-base">Raportare</span>
                        </button>

                        {/* Ștergere conversație - ULTIMUL */}
                        <button
                          onClick={() => {
                            setShowMobileMenu(false);
                            if (selectedConv) {
                              const conversationKey = selectedConv.buyerId 
                                ? `${selectedConv.productId}-${selectedConv.buyerId}`
                                : `${selectedConv.productId}-${selectedConv.sellerId}`;
                              setDeleteConversationKey(conversationKey);
                              setDeleteConversationIsReport(false);
                              setShowDeleteConversationModal(true);
                            }
                          }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left text-red-600 border-t border-gray-100"
                        >
                          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </div>
                          <span className="text-base font-medium">Ștergere conversație</span>
                        </button>
                      </div>
                    </div>
                    </>
                    )}
                  </div>

                  {/* Card produs */}
                  <div className="p-2 md:p-3 border-b border-gray-200 bg-white">
                    <div className="flex gap-2 md:gap-3">
                      <img
                        src={getProductDisplayImage(selectedConv.product)}
                        alt={selectedConv.product.title}
                        className="w-12 h-12 md:w-16 md:h-16 object-cover rounded flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                        }}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => router.push(`/live_bid/${selectedConv.product.slug || selectedConv.product.id}`)}
                          className="text-sm font-medium mb-2 text-gray-900 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                          title={`Vezi produsul: ${selectedConv.product.title}`}
                        >
                          {selectedConv.product.title}
                        </p>
                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                          {/* Input + „Plasează oferta” (sau „Prețul nu este negociabil”) doar dacă conversația a fost deschisă prin „Scrie mesaj” */}
                          {selectedConv.sellerId !== currentUserId && currentUserId != null && openedViaScrieMesaj && openedViaScrieMesaj.productId === selectedConv.productId && openedViaScrieMesaj.sellerId === selectedConv.sellerId && (() => {
                            const isFixedPrice = !!(selectedConv.product.customFields as Record<string, unknown> | undefined)?.is_fixed_price;
                            if (isFixedPrice) {
                              return (
                                <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                                  Prețul nu este negociabil
                                </span>
                              );
                            }
                            const convKey = `${selectedConv.productId}-${selectedConv.sellerId}`;
                            const targetUserId = selectedConv.sellerId;
                            const isBlocked = targetUserId && (blockedUsers.has(targetUserId) || usersBlockedMe.has(targetUserId));
                            const isPlacing = placingOffer[convKey];
                            const currency = selectedConv.product.currency || 'RON';
                            const minAmount = selectedConv.product.startingPrice ? Math.ceil(selectedConv.product.startingPrice * 0.33) : 1;
                            return (
                              <>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={`Sumă (min ${minAmount} ${currency})`}
                                  value={placeOfferAmount[convKey] ?? ''}
                                  onChange={(e) => setPlaceOfferAmount(prev => ({ ...prev, [convKey]: e.target.value }))}
                                  className="w-28 md:w-32 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                  disabled={!!isBlocked || isPlacing}
                                />
                                <button
                                  type="button"
                                  onClick={() => handlePlaceOfferFromChat(selectedConv.productId, placeOfferAmount[convKey] ?? '', convKey)}
                                  disabled={!!isBlocked || isPlacing}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                >
                                  {isPlacing ? 'Se trimite...' : 'Plasează oferta'}
                                </button>
                              </>
                            );
                          })()}
                          {/* Prețul cerut (tăiat) */}
                          {selectedConv.product.startingPrice && (
                            <span className="text-xs md:text-sm text-gray-500 line-through">
                              {new Intl.NumberFormat('ro-RO', {
                                style: 'currency',
                                currency: selectedConv.product.currency || 'RON',
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(selectedConv.product.startingPrice)}
                            </span>
                          )}
                          {/* Ultima ofertă */}
                          {selectedConv.latestBid && (
                            <span className="text-sm md:text-base font-semibold text-gray-900">
                              {new Intl.NumberFormat('ro-RO', {
                                style: 'currency',
                                currency: selectedConv.product.currency || 'RON',
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(selectedConv.latestBid.amount)}
                            </span>
                          )}
                          {/* Butoanele Contraoferta și Accepta */}
                          {selectedConv.latestBid && (() => {
                            const acceptedBid = acceptedBids[selectedConv.productId];
                            const acceptedBidId = acceptedBid?.bidId || null;
                            const countdown = countdowns[selectedConv.productId] || null;
                            const isSeller = selectedConv.product.user_id === currentUserId;
                            
                            // Verifică dacă utilizatorul este blocat
                            const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                              ? selectedConv.buyerId
                              : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                                ? selectedConv.sellerId
                                : null;
                            
                            const isBlocked = targetUserId && (blockedUsers.has(targetUserId) || usersBlockedMe.has(targetUserId));
                            
                            // Verifică dacă există orice ofertă acceptată complet (nu mai este în countdown)
                            // Verifică atât state-ul local cât și is_winning din baza de date
                            const hasWinningBid = selectedConv.bids?.some(b => b.is_winning === true) || false;
                            const isAcceptedComplete = hasWinningBid || (acceptedBidId !== null && (countdown === null || countdown <= 0));
                            
                            return (
                              <>
                                {/* Buton Contraoferta - nu se afișează dacă oferta este acceptată complet */}
                                {!isAcceptedComplete && (
                                  <button
                                    onClick={() => {
                                      const sortedBids = [...selectedConv.bids].sort((a, b) => 
                                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                      );
                                      let consecutiveCounterOffers = 0;
                                      for (let i = sortedBids.length - 1; i >= 0; i--) {
                                        if (sortedBids[i].user_id === currentUserId) {
                                          consecutiveCounterOffers++;
                                        } else {
                                          break;
                                        }
                                      }
                                      
                                      if (consecutiveCounterOffers === 1) {
                                        showNotificationRef.current.show('info', 'Informare', 'Ai făcut 99 contraoferte consecutive. Poți face maximum 100 contraoferte consecutive fără ca celălalt utilizator să răspundă. Dacă celălalt utilizator răspunde, vei putea face din nou până la 100 contraoferte.');
                                      }
                                      
                                      // Deschide modalul pentru contraofertă
                                      const userName = selectedConv.sellerInfo?.first_name && selectedConv.sellerInfo?.last_name
                                        ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                        : selectedConv.sellerInfo?.username || selectedConv.sellerInfo?.email || 'Vânzător';
                                      setCounterOfferModalData({
                                        productId: selectedConv.productId,
                                        bidId: selectedConv.latestBid.id,
                                        currentAmount: selectedConv.latestBid.amount,
                                        currency: selectedConv.product.currency || 'RON',
                                        userName: userName
                                      });
                                      setCounterOfferAmountModal('');
                                      setShowCounterOfferModal(true);
                                    }}
                                    disabled={!!isBlocked}
                                    className={`px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-full shadow-sm transition-all whitespace-nowrap ${
                                      isBlocked 
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-900 hover:scale-110 active:scale-95'
                                    }`}
                                  >
                                    Contraoferta
                                  </button>
                                )}
                                {/* Butoane Accepta și Refuză - pentru oricine primește o ofertă */}
                                {/* Dacă ultima ofertă NU este de la mine, pot să o accept/refuz */}
                                {(() => {
                                  const shouldShowButtons = selectedConv.latestBid.user_id !== currentUserId;
                                  console.log('🔘 [Accept/Refuse Buttons] Should show?', {
                                    shouldShowButtons,
                                    latestBidUserId: selectedConv.latestBid.user_id,
                                    currentUserId: currentUserId,
                                    isSeller,
                                    latestBidAmount: selectedConv.latestBid.amount
                                  });
                                  return shouldShowButtons;
                                })() && (
                                  <>
                                    {acceptedBidId === selectedConv.latestBid.id && countdown !== null && countdown > 0 ? (
                                      <>
                                        <button
                                          onClick={() => handleCancelAccept(selectedConv.productId, selectedConv.latestBid.id)}
                                          className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                        >
                                          Razgandeste ({Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')})
                                        </button>
                                        <button
                                          onClick={() => handleFinalizeAccept(selectedConv.productId, selectedConv.latestBid.id)}
                                          className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                        >
                                          Accepta nu mai astepta
                                        </button>
                                        <button
                                          onClick={() => handleRefuseBid(selectedConv.productId, selectedConv.latestBid.id, selectedConv.latestBid.amount)}
                                          disabled={!!isBlocked}
                                          className={`px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium shadow-sm transition-all whitespace-nowrap ${
                                            isBlocked
                                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                              : 'bg-gray-500 hover:bg-gray-600 text-white hover:scale-110 active:scale-95'
                                          }`}
                                        >
                                          Refuză
                                        </button>
                                      </>
                                    ) : acceptedBidId === selectedConv.latestBid.id ? (
                                      <span className="px-4 py-2.5 rounded-full text-sm font-medium bg-green-500 text-white shadow-sm whitespace-nowrap">
                                        Acceptată
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleAcceptBid(selectedConv.productId, selectedConv.latestBid.id, selectedConv.latestBid.amount)}
                                          disabled={acceptedBidId !== null || !!isBlocked}
                                          className={`px-4 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all whitespace-nowrap ${
                                            acceptedBidId !== null || isBlocked
                                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                              : 'bg-red-500 hover:bg-red-600 text-white hover:scale-110 active:scale-95'
                                          }`}
                                        >
                                          Acceptă
                                        </button>
                                        <button
                                          onClick={() => {
                                            console.log('🔴 [Refuză Button] Clicked!', {
                                              productId: selectedConv.productId,
                                              bidId: selectedConv.latestBid.id,
                                              amount: selectedConv.latestBid.amount,
                                              isBlocked,
                                              acceptedBidId
                                            });
                                            handleRefuseBid(selectedConv.productId, selectedConv.latestBid.id, selectedConv.latestBid.amount);
                                          }}
                                          disabled={!!isBlocked}
                                          className={`px-4 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all whitespace-nowrap ${
                                            isBlocked
                                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                              : 'bg-gray-500 hover:bg-gray-600 text-white hover:scale-110 active:scale-95'
                                          }`}
                                        >
                                          Refuză
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Mesaje (oferte) - Zona mai mare pentru a vedea mai multe mesaje */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden relative min-h-0">
                    <div className="p-3 space-y-3">
                    {/* Mesaj respectuos de la cumpărător (utilizatorul curent) - doar pentru product_chats */}
                    {selectedConv && selectedConv.type !== 'user' && currentUserId && selectedConv.product.user_id !== currentUserId && currentUserProfile && (
                      <div className="flex gap-2 flex-row-reverse">
                        {currentUserProfile.first_name?.[0] ? (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-blue-500 text-white flex-shrink-0">
                            {currentUserProfile.first_name[0].toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-blue-500 text-white flex-shrink-0">
                            {(currentUserProfile.email?.[0] || 'U').toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 flex flex-col items-end">
                          <div className="inline-block px-3 py-2 rounded-lg bg-blue-500 text-white max-w-[85%]">
                            <p className="text-sm whitespace-pre-wrap">
                              Bună, numele meu este {currentUserProfile.first_name && currentUserProfile.last_name
                                ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
                                : currentUserProfile.email || 'Utilizator'} și sunt interesat să achiziționez {selectedConv.product.title} și pentru asta sunt dispus să negociez cu dumneavoastră.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Mesaj de la vânzător cu informații (dacă utilizatorul este vânzător) - doar pentru product_chats */}
                    {selectedConv.type !== 'user' && selectedConv.sellerInfo && selectedConv.product.user_id === currentUserId && (
                      <div className="flex gap-2">
                        {selectedConv.sellerInfo.avatar_url ? (
                          <img
                            src={selectedConv.sellerInfo.avatar_url}
                            alt="Vânzător"
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700 flex-shrink-0">
                            {(selectedConv.sellerInfo.first_name?.[0] || selectedConv.sellerInfo.username?.[0] || 'V').toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="inline-block px-3 py-2 rounded-lg bg-gray-100 text-gray-900">
                            <p className="text-sm mb-1">
                              Salut, eu sunt {selectedConv.sellerInfo.first_name && selectedConv.sellerInfo.last_name
                                ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                : selectedConv.sellerInfo.username || selectedConv.sellerInfo.email || 'Vânzător'}
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
                    )}

                    {/* Oferte și Mesaje */}
                    {(() => {
                      // Pentru user_chats (fără produs), mesajele sunt stocate sub cheia `user-chat-${userChatId}`
                      // Pentru product_chats, folosim cheia compusă cu productId + buyerId/sellerId
                      const conversationKey = selectedConv.type === 'user' && selectedConv.userChatId
                        ? `user-chat-${selectedConv.userChatId}`
                        : selectedConv.buyerId
                          ? `${selectedConv.productId}-${selectedConv.buyerId}`
                          : `${selectedConv.productId}-${selectedConv.sellerId}`;
                      const messages = (chatMessages[conversationKey] || []).filter(msg => {
                        const hasRequiredFields = msg && msg.id && msg.message_text;
                        if (!hasRequiredFields) {
                          console.warn('[Chat] Message missing required fields:', { 
                            id: msg?.id, 
                            hasMessageText: !!msg?.message_text,
                            message: msg 
                          });
                        }
                        return hasRequiredFields;
                      });
                      const sortedBids = [...selectedConv.bids].sort((a, b) => 
                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                      );
                      
                      // Combină ofertele și mesajele text
                      // Elimină duplicatele de bids folosind un Map
                      const uniqueBidsMap = new Map<string, any>();
                      sortedBids.forEach(bid => {
                        if (!uniqueBidsMap.has(bid.id)) {
                          uniqueBidsMap.set(bid.id, bid);
                        }
                      });
                      const uniqueBids = Array.from(uniqueBidsMap.values());
                      
                      const allItems: Array<{
                        type: 'bid' | 'message';
                        bid?: any;
                        message?: any;
                        timestamp: number;
                        uniqueKey: string;
                      }> = [
                        ...uniqueBids.map(bid => ({
                          type: 'bid' as const,
                          bid,
                          timestamp: new Date(bid.created_at).getTime(),
                          uniqueKey: `bid-${selectedConv.productId}-${bid.id}`
                        })),
                        ...messages.map((msg, index) => ({
                          type: 'message' as const,
                          message: msg,
                          timestamp: new Date(msg.created_at).getTime(),
                          uniqueKey: `msg-${selectedConv.productId}-${msg.id}-${index}`
                        }))
                      ];
                      
                      // Sortează după timestamp
                      allItems.sort((a, b) => a.timestamp - b.timestamp);
                      
                      if (allItems.length === 0) {
                        return (
                          <div className="text-center py-8 text-gray-500">
                            <p>Nu există oferte încă</p>
                          </div>
                        );
                      }
                      
                      const bidItems = allItems.map((item) => {
                        if (!item || !item.type) {
                          return null;
                        }
                        
                        if (item.type === 'message') {
                          // Mesaj text
                          const msg = item.message;
                          if (!msg || !msg.id || !msg.message_text) {
                            return null;
                          }
                          const isSystemMessage = msg.is_system_message === true || msg.sender_user_id === null;
                          const isMyMessage = msg.sender_user_id === currentUserId;
                          
                          // Determină informațiile despre celălalt utilizator pentru mesajele primite
                          let otherUserAvatar = null;
                          let otherUserInitial = 'U';
                          let otherUserName = 'Utilizator';
                          if (!isMyMessage) {
                            // Pentru mesajele primite, determină dacă sunt de la seller sau buyer
                            const isFromSeller = msg.sender_user_id === selectedConv.sellerId;
                            if (isFromSeller && selectedConv.sellerInfo) {
                              otherUserAvatar = selectedConv.sellerInfo.avatar_url;
                              otherUserInitial = (selectedConv.sellerInfo.first_name?.[0] || selectedConv.sellerInfo.username?.[0] || 'V').toUpperCase();
                              otherUserName = selectedConv.sellerInfo.first_name && selectedConv.sellerInfo.last_name
                                ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                : selectedConv.sellerInfo.first_name || selectedConv.sellerInfo.username || 'Utilizator';
                            } else if (!isFromSeller && selectedConv.buyerId && selectedConv.buyerId !== currentUserId) {
                              // Încarcă informațiile buyer-ului dacă este diferit de user-ul curent
                              // Pentru simplificare, folosim sellerInfo ca fallback
                              otherUserAvatar = selectedConv.sellerInfo?.avatar_url;
                              otherUserInitial = (selectedConv.sellerInfo?.first_name?.[0] || selectedConv.sellerInfo?.username?.[0] || 'V').toUpperCase();
                              otherUserName = selectedConv.sellerInfo?.first_name && selectedConv.sellerInfo?.last_name
                                ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                : selectedConv.sellerInfo?.first_name || selectedConv.sellerInfo?.username || 'Utilizator';
                            }
                          }
                          
                          // Determină numele utilizatorului curent
                          const currentUserName = currentUserProfile?.first_name && currentUserProfile?.last_name
                            ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
                            : currentUserProfile?.first_name || currentUserProfile?.email?.split('@')[0] || 'Eu';
                          
                          // Determină statusul mesajului (văzut/trimis/netrimis)
                          // is_read = true înseamnă că destinatarul a citit mesajul
                          const isRead = msg.is_read === true;
                          const isSent = true; // Dacă mesajul apare în chat, înseamnă că a fost trimis
                          
                          // Pentru mesajele de sistem, afișează un stil special centrat
                          if (isSystemMessage) {
                            // CHAT REQUEST - Verifică dacă este mesaj de cerere de chat
                            if (msg.metadata?.type === 'chat_request') {
                              // Expeditorul cererii = cel care a trimis mesajul de sistem
                              const isSenderOfRequest = msg.sender_user_id === currentUserId;
                              // Doar destinatarul poate accepta/refuza; expeditorul vede doar statusul
                              const isRequestPending = true; // TODO: verifică din state dacă cererea e pending
                              // Acceptă atât `requestId` (camelCase, format nou) cât și `request_id` (snake_case, format legacy)
                              const requestId = msg.metadata?.requestId || msg.metadata?.request_id;
                              // Text adaptat: pentru destinatar afișează textul original; pentru expeditor, afișează că aștepți răspuns
                              const displayedRequestText = isSenderOfRequest
                                ? 'Ai trimis o cerere de chat. Aștepți răspuns...'
                                : msg.message_text;

                              return (
                                <div key={msg.id} className="flex justify-center my-4">
                                  <div className="inline-flex flex-col items-center gap-3 max-w-[90%]">
                                    {/* Mesajul cu iconița */}
                                    <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200/50 shadow-md">
                                      <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                      <span className="text-sm text-gray-800 font-medium">{displayedRequestText}</span>
                                    </div>
                                    
                                    {/* Butoane Acceptă/Refuză - doar pentru destinatarul cererii */}
                                    {isRequestPending && !isSenderOfRequest && (
                                      <div className="flex gap-3">
                                        <button
                                          onClick={() => {
                                            if (requestId && selectedConversation?.userChatId) {
                                              handleAcceptChatRequest(requestId, selectedConversation.userChatId);
                                            }
                                          }}
                                          className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2"
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                          Acceptă
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (requestId && selectedConversation?.userChatId) {
                                              handleRefuseChatRequest(requestId, selectedConversation.userChatId);
                                            }
                                          }}
                                          className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-2"
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                          Refuză
                                        </button>
                                      </div>
                                    )}
                                    
                                    {/* Timestamp */}
                                    <span className="text-xs text-gray-400">
                                      {(() => {
                                        const date = new Date(msg.created_at);
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
                            
                            // Verifică dacă mesajul este despre blocare/deblocare utilizator
                            let displayMessage = msg.message_text || '';
                            const blockMessageMatch = displayMessage.match(/^\[BLOCK_MSG:([^:]+):([^\]]+)\](.+)\|(.+)$/);
                            if (blockMessageMatch) {
                              const [, blockerUserId, blockedUserId, messageForBlocker, messageForBlocked] = blockMessageMatch;
                              // Afișează mesajul corect în funcție de utilizatorul curent
                              if (currentUserId === blockerUserId) {
                                displayMessage = messageForBlocker;
                              } else if (currentUserId === blockedUserId) {
                                displayMessage = messageForBlocked;
                              } else {
                                // Pentru alte cazuri, afișează mesajul pentru blocator
                                displayMessage = messageForBlocker;
                              }
                            }
                            
                            // Verifică dacă mesajul este despre acceptare/refuzare/contraofertă/ofertă primită (design special)
                            const isOfferStatusMessage = displayMessage && (
                              displayMessage.includes('a fost acceptată') ||
                              displayMessage.includes('a fost refuzată') ||
                              displayMessage.includes('Contraofertă:') ||
                              displayMessage.includes('Contraoferta') ||
                              displayMessage.includes('Ai primit o ofertă') ||
                              displayMessage.includes('Ai primit o contraofertă') ||
                              displayMessage.includes('Ai trimis o contraofertă')
                            );
                            
                            // Design special pentru mesaje de status oferte (ca în poză)
                            if (isOfferStatusMessage) {
                              // Determină tipul de mesaj
                              const isAccepted = displayMessage.includes('a fost acceptată');
                              const isRefused = displayMessage.includes('a fost refuzată');
                              const isCounterOffer = displayMessage.includes('Contraofertă:') || displayMessage.includes('Contraoferta') || displayMessage.includes('contraofertă');
                              const isFirstOffer = displayMessage.includes('Ai primit o ofertă');
                              
                              // Curăță mesajul de caracterele vechi ✓, ✕, ↻
                              const cleanMessage = displayMessage.replace(/^[✓✕↻]\s*/, '').trim();
                              
                              return (
                                <div key={msg.id} className="flex justify-center my-3">
                                  <div className="inline-flex flex-col items-center gap-1.5 max-w-[90%]">
                                    <div className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-[#EBF4FF] shadow-sm">
                                      {/* Icon checkmark pentru acceptată */}
                                      {isAccepted && (
                                        <span className="text-[#36454F] text-base">✓</span>
                                      )}
                                      {/* Icon X pentru refuzată */}
                                      {isRefused && (
                                        <span className="text-[#36454F] text-base">✕</span>
                                      )}
                                      {/* Icon pentru contraofertă */}
                                      {isCounterOffer && (
                                        <span className="text-[#36454F] text-base">↻</span>
                                      )}
                                      {/* Icon pentru prima ofertă */}
                                      {isFirstOffer && (
                                        <span className="text-[#36454F] text-base">💰</span>
                                      )}
                                      <span className="text-sm text-[#36454F]">{cleanMessage}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Verifică dacă mesajul este despre activarea modului privacy
                            const isPrivacyModeMessage = displayMessage && (
                              displayMessage.includes('ales să comunice doar prin oferte') ||
                              displayMessage.includes('Vânzătorul') ||
                              displayMessage.includes('Cumpărătorul')
                            );
                            
                            // Verifică dacă mesajul este despre blocare/deblocare utilizator
                            const isBlockMessage = displayMessage && (
                              displayMessage.includes('Ai blocat') || 
                              displayMessage.includes('Ai fost blocat')
                            );
                            const isUnblockMessage = displayMessage && (
                              displayMessage.includes('Ai deblocat') || 
                              displayMessage.includes('Ai fost deblocat')
                            );
                            
                            // Determină culoarea fundalului în funcție de tipul mesajului
                            let messageBackgroundClass = 'bg-gradient-to-r from-blue-50 to-blue-50 border-blue-200/50';
                            if (isBlockMessage) {
                              messageBackgroundClass = 'bg-gradient-to-r from-red-50 to-red-100/50 border-red-200/50';
                            } else if (isUnblockMessage) {
                              messageBackgroundClass = 'bg-gradient-to-r from-green-50 to-green-100/50 border-green-200/50';
                            }
                            
                            // Determină conversationKey pentru a verifica starea de blocare
                            const conversationKey = selectedConv?.buyerId 
                              ? `${selectedConv.productId}-${selectedConv.buyerId}`
                              : selectedConv 
                              ? `${selectedConv.productId}-${selectedConv.sellerId}`
                              : null;
                            
                            // Verifică dacă chat-ul este blocat
                            const blockState = conversationKey ? blockedChats[conversationKey] : null;
                            const isBlocked = blockState 
                              ? (blockState.blocked_by_seller || blockState.blocked_by_buyer)
                              : false;
                            
                            return (
                              <div key={item.uniqueKey} className="flex justify-center my-3">
                                <div className="inline-flex flex-col items-center gap-2 max-w-[85%]">
                                  <div className={`relative group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-sm text-center ${messageBackgroundClass}`}>
                                    <div className="flex items-start gap-2">
                                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{displayMessage}</p>
                                      {/* Icon info cu tooltip pentru mesajele despre privacy mode - schimbă culoarea în funcție de starea lacătului */}
                                      {isPrivacyModeMessage && (
                                        <div className="flex-shrink-0 relative group/tooltip">
                                          <svg 
                                            className={`w-6 h-6 cursor-help transition-all hover:scale-110 ${isBlocked ? 'text-red-600' : 'text-green-600'}`}
                                            fill="none" 
                                            stroke="currentColor" 
                                            strokeWidth="2"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          {/* Tooltip - centrat și adaptat la fereastră */}
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999] w-[calc(100vw-2rem)] max-w-[320px] mx-auto text-left break-words" style={{ left: '50%', right: 'auto', transform: 'translateX(-50%)' }}>
                                            Celălalt utilizator a activat modul privacy. Chat-ul permite doar oferte și contraoferte până când se ajunge la un consens. Poți dezactiva modul privacy din setările conversației.
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {/* Timestamp pentru mesajele automate */}
                                  <span className="text-xs text-gray-400">
                                    {(() => {
                                      const date = new Date(msg.created_at);
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
                          
                          return (
                            <div
                              key={item.uniqueKey}
                              className={`flex gap-2 ${isMyMessage ? 'flex-row-reverse' : ''}`}
                            >
                              {!isMyMessage && (
                                <div className="flex-shrink-0">
                                  {otherUserAvatar ? (
                                    <img
                                      src={otherUserAvatar}
                                      alt={otherUserName}
                                      className="w-8 h-8 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700">
                                      {otherUserInitial}
                                    </div>
                                  )}
                                </div>
                              )}
                              {isMyMessage && (
                                <div className="flex-shrink-0">
                                  {currentUserProfile?.avatar_url ? (
                                    <img
                                      src={currentUserProfile.avatar_url}
                                      alt="Eu"
                                      className="w-8 h-8 rounded-full object-cover border-2 border-blue-200"
                                      onError={(e) => {
                                        // Fallback la inițială dacă imaginea nu se încarcă
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                          parent.innerHTML = `
                                            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-blue-500 text-white border-2 border-blue-200">
                                              ${(currentUserProfile?.first_name?.[0] || currentUserProfile?.email?.[0] || 'U').toUpperCase()}
                                            </div>
                                          `;
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-blue-500 text-white border-2 border-blue-200">
                                      {(currentUserProfile?.first_name?.[0] || currentUserProfile?.email?.[0] || 'U').toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <div 
                                className={`flex-1 ${isMyMessage ? 'flex flex-col items-end' : ''}`}
                              >
                                {/* Numele utilizatorului */}
                                <p className={`text-xs mb-1 ${isMyMessage ? 'text-right' : 'text-left'} text-gray-600 font-medium`}>
                                  {isMyMessage ? 'Eu' : otherUserName}
                                </p>
                                
                                {/* Parsează și afișează mesajul cu imagini */}
                                {(() => {
                                  const messageText = msg.message_text || '';
                                  
                                  // Verifică dacă mesajul este doar emoji (fără tag-uri IMAGE)
                                  const hasImageTags = /\[IMAGE:(.+?)\]/g.test(messageText);
                                  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/gu;
                                  const textWithoutEmojis = messageText.replace(/\[IMAGE:(.+?)\]/g, '').replace(emojiRegex, '').trim();
                                  const isOnlyEmoji = !hasImageTags && textWithoutEmojis === '' && messageText.trim().length > 0;
                                  
                                  const imageRegex = /\[IMAGE:(.+?)\]/g;
                                  const parts: Array<{ type: 'text' | 'image'; content: string }> = [];
                                  let lastIndex = 0;
                                  let match;

                                  while ((match = imageRegex.exec(messageText)) !== null) {
                                    // Adaugă textul înainte de imagine
                                    if (match.index > lastIndex) {
                                      parts.push({
                                        type: 'text',
                                        content: messageText.substring(lastIndex, match.index)
                                      });
                                    }
                                    // Adaugă imaginea
                                    parts.push({
                                      type: 'image',
                                      content: match[1]
                                    });
                                    lastIndex = match.index + match[0].length;
                                  }

                                  // Adaugă textul rămas
                                  if (lastIndex < messageText.length) {
                                    parts.push({
                                      type: 'text',
                                      content: messageText.substring(lastIndex)
                                    });
                                  }

                                  // Verifică dacă există imagini în parts
                                  const hasImages = parts.some(p => p.type === 'image');
                                  
                                  // Stilizare condiționată: fără fundal dacă este doar emoji sau dacă conține imagini
                                  const bubbleClasses = (isOnlyEmoji || hasImages)
                                    ? 'inline-block px-1 py-1'
                                    : `inline-block px-3 py-2 rounded-lg ${
                                        isMyMessage
                                          ? 'bg-blue-500 text-white'
                                          : 'bg-gray-100 text-gray-900'
                                      }`;

                                  // Funcție helper pentru a detecta și mări emoji-urile
                                  const renderMessageWithEmojis = (text: string) => {
                                    // Regex mai strict pentru emoji-uri - exclude cifre, litere și alte simboluri
                                    // Folosim doar Emoji_Presentation pentru a evita false positive-uri
                                    // Și excludem caracterele care nu sunt emoji-uri reale (cifre, litere, etc.)
                                    const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Component})/gu;
                                    const parts: Array<{ type: 'text' | 'emoji'; content: string }> = [];
                                    let lastIndex = 0;
                                    let match;

                                    // Verificare suplimentară: un emoji real nu este o cifră sau literă ASCII
                                    const isRealEmoji = (char: string): boolean => {
                                      // Exclude cifre 0-9
                                      if (/^[0-9]$/.test(char)) return false;
                                      // Exclude litere ASCII (a-z, A-Z)
                                      if (/^[a-zA-Z]$/.test(char)) return false;
                                      // Exclude simboluri matematice comune care pot fi confundate
                                      if (/^[\u2070-\u209F]$/.test(char)) return false; // Superscripts/subscripts
                                      // Exclude caracterele de simbol matematic
                                      if (/^[\u2200-\u22FF]$/.test(char)) return false; // Mathematical operators
                                      return true;
                                    };

                                    while ((match = emojiRegex.exec(text)) !== null) {
                                      const matchedChar = match[0];
                                      
                                      // Verifică dacă este un emoji real (nu cifră/literă)
                                      if (!isRealEmoji(matchedChar)) {
                                        continue; // Sărim peste, nu este emoji
                                      }
                                      
                                      // Adaugă textul înainte de emoji
                                      if (match.index > lastIndex) {
                                        parts.push({
                                          type: 'text',
                                          content: text.substring(lastIndex, match.index)
                                        });
                                      }
                                      // Adaugă emoji-ul
                                      parts.push({
                                        type: 'emoji',
                                        content: matchedChar
                                      });
                                      lastIndex = match.index + match[0].length;
                                    }

                                    // Adaugă textul rămas
                                    if (lastIndex < text.length) {
                                      parts.push({
                                        type: 'text',
                                        content: text.substring(lastIndex)
                                      });
                                    }

                                    // Dacă nu există emoji-uri reale, returnează textul normal
                                    if (parts.length === 0 || parts.every(p => p.type === 'text')) {
                                      return <span className="text-sm whitespace-pre-wrap">{text}</span>;
                                    }

                                    // Returnează mesajul cu emoji-uri mărite (doar emoji-uri reale)
                                    return (
                                      <span className="text-sm whitespace-pre-wrap">
                                        {parts.map((part, idx) => {
                                          if (part.type === 'emoji' && isRealEmoji(part.content)) {
                                            return (
                                              <span key={idx} className="inline-block text-2xl leading-none align-middle" style={{ fontSize: '1.75rem' }}>
                                                {part.content}
                                              </span>
                                            );
                                          }
                                          return <span key={idx} className="text-sm">{part.content}</span>;
                                        })}
                                      </span>
                                    );
                                  };

                                  // Dacă nu există imagini, afișează mesajul normal cu emoji-uri mărite
                                  if (parts.length === 0 || parts.every(p => p.type === 'text')) {
                                    return (
                                      <div className={bubbleClasses}>
                                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderMessageWithEmojis(messageText)}</p>
                                      </div>
                                    );
                                  }

                                  // Extrage imagini și text separat pentru layout modern
                                  const imageParts = parts.filter(p => p.type === 'image');
                                  const hasMultipleImages = imageParts.length > 1;
                                  
                                  // Helper pentru deschidere modal cu galerie
                                  const openImageGallery = (imageUrl: string) => {
                                    const allImages = imageParts.map(p => p.content);
                                    const imageIndex = allImages.indexOf(imageUrl);
                                    setImageModalUrls(allImages);
                                    setImageModalCurrentIndex(imageIndex >= 0 ? imageIndex : 0);
                                  };
                                  
                                  // Afișează mesajul cu imagini și emoji-uri mărite
                                  return (
                                    <div className={bubbleClasses}>
                                      <div className="space-y-2">
                                        {parts.map((part, index) => {
                                          // Dacă este text, afișează normal
                                          if (part.type === 'text') {
                                            return part.content.trim() ? (
                                              <p key={`part-${index}`} className="text-sm whitespace-pre-wrap leading-relaxed">
                                                {renderMessageWithEmojis(part.content)}
                                              </p>
                                            ) : null;
                                          }
                                          
                                          // Dacă este imagine
                                          if (part.type === 'image') {
                                            // Găsește prima imagine din parts pentru a determina dacă suntem la începutul grupului
                                            const firstImageIndex = parts.findIndex(p => p.type === 'image');
                                            
                                            // Dacă suntem la prima imagine și avem multiple imagini, afișăm galeria
                                            if (index === firstImageIndex && hasMultipleImages) {
                                              return (
                                                <div key={`gallery-${index}`} className="grid grid-cols-2 gap-2 max-w-md">
                                                  {imageParts.map((imgPart, imgIndex) => {
                                                    const totalImages = imageParts.length;
                                                    
                                                    // Layout asimetric bazat pe numărul de imagini
                                                    let gridClasses = '';
                                                    let heightClass = 'h-32';
                                                    
                                                    if (totalImages === 2) {
                                                      // 2 imagini: prima pe două coloane
                                                      if (imgIndex === 0) {
                                                        gridClasses = 'col-span-2';
                                                        heightClass = 'h-48';
                                                      }
                                                    } else if (totalImages === 3) {
                                                      // 3 imagini: prima pe două coloane, restul pe una
                                                      if (imgIndex === 0) {
                                                        gridClasses = 'col-span-2 row-span-1';
                                                        heightClass = 'h-40';
                                                      }
                                                    } else if (totalImages === 4) {
                                                      // 4 imagini: grid uniform 2x2
                                                      // Prima poate fi puțin mai mare
                                                      if (imgIndex === 0) {
                                                        gridClasses = 'row-span-2';
                                                        heightClass = 'h-48';
                                                      } else if (imgIndex === 1) {
                                                        gridClasses = 'row-span-2';
                                                        heightClass = 'h-48';
                                                      }
                                                    } else {
                                                      // 5+ imagini: prima pe două coloane dacă impar, altfel grid uniform
                                                      if (imgIndex === 0 && totalImages % 2 === 1) {
                                                        gridClasses = 'col-span-2';
                                                        heightClass = 'h-40';
                                                      } else if (imgIndex < 2) {
                                                        gridClasses = 'row-span-2';
                                                        heightClass = 'h-48';
                                                      }
                                                    }
                                                    
                                                    return (
                                                      <div
                                                        key={`img-${imgIndex}`}
                                                        className={`relative group cursor-pointer overflow-hidden rounded-lg ${heightClass} ${gridClasses}`}
                                                        onClick={() => openImageGallery(imgPart.content)}
                                                      >
                                                        <img
                                                          src={imgPart.content}
                                                          alt={`Chat image ${imgIndex + 1}`}
                                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg" />
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              );
                                            } else if (!hasMultipleImages) {
                                              // O singură imagine - afișare normală
                                              return (
                                                <img
                                                  key={`img-${index}`}
                                                  src={part.content}
                                                  alt="Chat image"
                                                  className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => openImageGallery(part.content)}
                                                />
                                              );
                                            }
                                            
                                            // Skip restul imaginilor deoarece au fost deja afișate în galerie
                                            return null;
                                          }
                                          
                                          return null;
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                                
                                <div className={`flex items-center gap-1 mt-1 ${isMyMessage ? 'flex-row-reverse' : ''}`}>
                                  <span className="text-xs text-gray-400">
                                    {(() => {
                                      const date = new Date(msg.created_at);
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
                                  {/* Status văzut - doar pentru mesajele trimise */}
                                  {isMyMessage && (
                                    <div className="flex items-center gap-1">
                                      {isRead ? (
                                        // Două checkmark-uri verzi (citit)
                                        <>
                                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                          <span className="text-xs text-gray-400">Văzut</span>
                                        </>
                                      ) : isSent ? (
                                        // Două checkmark-uri gri (trimis, dar necitit)
                                        <>
                                          <div className="flex -space-x-1">
                                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                          <span className="text-xs text-gray-400">Trimis</span>
                                        </>
                                      ) : (
                                        // Un checkmark gri (netrimis)
                                        <>
                                          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                          <span className="text-xs text-gray-400">Trimis</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        // Ofertă - afișează ca mesaj text simplu
                        const bid = item.bid;
                        if (!bid || !bid.id) {
                          return null;
                        }
                        const isMyBid = bid.user_id === currentUserId;
                        const isWinning = bid.is_winning;
                        // Verifică dacă utilizatorul curent este vânzătorul produsului
                        const isSeller = selectedConv.product.user_id === currentUserId;
                        const acceptedBid = acceptedBids[selectedConv.productId];
                        const acceptedBidId = acceptedBid?.bidId || null;
                        const countdown = countdowns[selectedConv.productId] || null;
                        
                        // Găsește ultima ofertă (nu mesaj text)
                        const allBidsOnly = allItems.filter(i => i.type === 'bid');
                        const lastBidIndex = allBidsOnly.length > 0 ? allBidsOnly[allBidsOnly.length - 1] : null;
                        const isLastBid = lastBidIndex && lastBidIndex.bid?.id === bid.id;
                        
                        // Determină dacă este contraoferta (există oferte anterioare de la alt user)
                        const previousBids = allBidsOnly
                          .filter((b, idx) => {
                            const bidTimestamp = new Date(b.bid.created_at).getTime();
                            const currentTimestamp = new Date(bid.created_at).getTime();
                            return bidTimestamp < currentTimestamp;
                          })
                          .map(b => b.bid);
                        const isCounterOffer = previousBids.length > 0 && previousBids.some(b => b.user_id !== bid.user_id);
                        
                        // Determină statusul ofertei
                        let offerStatus: 'accepted' | 'refused' | 'counter' | 'normal' | 'first' = 'normal';
                        if (isWinning) {
                          offerStatus = 'accepted';
                        } else if (bid.is_outbid) {
                          offerStatus = 'refused';
                        } else if (isCounterOffer) {
                          offerStatus = 'counter';
                        } else if (previousBids.length === 0) {
                          offerStatus = 'first';
                        }
                        
                        // Format suma
                        const formattedAmount = new Intl.NumberFormat('ro-RO', {
                          style: 'currency',
                          currency: selectedConv.product.currency || 'RON',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(bid.amount);
                        
                        // Creează mesajul text în funcție de context
                        let bidMessage = '';
                        let icon = '';
                        
                        if (offerStatus === 'first') {
                          // Prima ofertă
                          const productTitle = selectedConv.product.title || 'anunțul tău';
                          if (isMyBid) {
                            bidMessage = `Ai trimis o ofertă de ${formattedAmount} pentru ${productTitle}!`;
                            icon = '💰';
                          } else {
                            bidMessage = `Ai primit o ofertă de ${formattedAmount} pentru ${productTitle}!`;
                            icon = '💰';
                          }
                        } else if (offerStatus === 'counter') {
                          // Contraofertă
                          if (isMyBid) {
                            bidMessage = `Ai trimis o contraofertă de ${formattedAmount}!`;
                            icon = '↻';
                          } else {
                            bidMessage = `Ai primit o contraofertă de ${formattedAmount}!`;
                            icon = '↻';
                          }
                        } else {
                          // Ofertă normală (nu prima, nu contraofertă)
                          if (isMyBid) {
                            bidMessage = `Ai trimis o ofertă de ${formattedAmount}!`;
                            icon = '💰';
                          } else {
                            bidMessage = `Ai primit o ofertă de ${formattedAmount}!`;
                            icon = '💰';
                          }
                        }
                        
                        return (
                          <div key={item.uniqueKey}>
                            {/* Mesaj text simplu pentru ofertă */}
                            <div className="flex justify-center my-3">
                              <div className="inline-flex flex-col items-center gap-1.5 max-w-[90%]">
                                <div className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-[#EBF4FF] shadow-sm">
                                  <span className="text-[#36454F] text-base">{icon}</span>
                                  <span className="text-sm text-[#36454F]">{bidMessage}</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                  {(() => {
                                    const date = new Date(bid.created_at);
                                    const now = new Date();
                                    const diffMs = now.getTime() - date.getTime();
                                    const diffMins = Math.floor(diffMs / 60000);
                                    
                                    if (diffMins < 1) return 'acum';
                                    if (diffMins < 60) return `acum ${diffMins} min`;
                                    const diffHours = Math.floor(diffMs / 3600000);
                                    if (diffHours < 24) return `acum ${diffHours} h`;
                                    const diffDays = Math.floor(diffMs / 86400000);
                                    if (diffDays === 1) return 'acum 1 zi';
                                    return `acum ${diffDays} zile`;
                                  })()}
                                </span>
                              </div>
                            </div>
                            
                            {/* Butoane pentru acțiuni (doar pentru ultima ofertă neprocesată) */}
                            <div className="flex justify-center">
                              <div className={`flex items-center gap-2 ${isMyBid ? 'flex-row-reverse' : ''}`}>
                                
                                {/* Butoane pe același rând */}
                                {!isMyBid && isLastBid && !isWinning && (() => {
                                  const isCurrentUserSeller = selectedConv.product.user_id === currentUserId;
                                  
                                  // Verifică dacă există orice ofertă acceptată complet (nu mai este în countdown)
                                  // Verifică atât state-ul local cât și is_winning din baza de date
                                  const acceptedBidForThis = acceptedBids[selectedConv.productId];
                                  const acceptedBidIdForThis = acceptedBidForThis?.bidId || null;
                                  const countdownForThis = countdowns[selectedConv.productId] || null;
                                  const hasWinningBid = selectedConv.bids?.some(b => b.is_winning === true) || false;
                                  const isAcceptedComplete = hasWinningBid || (acceptedBidIdForThis !== null && (countdownForThis === null || (countdownForThis || 0) <= 0));
                                  
                                  // Nu afișa butoanele dacă există orice ofertă acceptată complet
                                  if (isAcceptedComplete) return null;
                                  
                                  if (isCurrentUserSeller) {
                                    // Pentru vânzători - butoanele Acceptă și Contraoferta
                                    const sortedBids = [...selectedConv.bids].sort((a, b) => 
                                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                    );
                                    let consecutiveCounterOffers = 0;
                                    for (let i = sortedBids.length - 1; i >= 0; i--) {
                                      if (sortedBids[i].user_id === currentUserId) {
                                        consecutiveCounterOffers++;
                                      } else {
                                        break;
                                      }
                                    }
                                    
                                    return (
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                          onClick={() => {
                                            if (consecutiveCounterOffers === 1) {
                                              showNotificationRef.current.show('info', 'Informare', 'Ai făcut 99 contraoferte consecutive. Poți face maximum 100 contraoferte consecutive fără ca celălalt utilizator să răspundă. Dacă celălalt utilizator răspunde, vei putea face din nou până la 100 contraoferte.');
                                            }
                                            
                                            // Deschide modalul pentru contraofertă
                                            const userName = selectedConv.sellerInfo?.first_name && selectedConv.sellerInfo?.last_name
                                              ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                              : selectedConv.sellerInfo?.username || selectedConv.sellerInfo?.email || 'Vânzător';
                                            setCounterOfferModalData({
                                              productId: selectedConv.productId,
                                              bidId: bid.id,
                                              currentAmount: bid.amount,
                                              currency: selectedConv.product.currency || 'RON',
                                              userName: userName
                                            });
                                            setCounterOfferAmountModal('');
                                            setShowCounterOfferModal(true);
                                          }}
                                          className="px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-full bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                        >
                                          Contraoferta
                                        </button>
                                        {acceptedBidId === bid.id && countdown !== null && countdown > 0 ? (
                                          <>
                                            <button
                                              onClick={() => handleCancelAccept(selectedConv.productId, bid.id)}
                                              className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                            >
                                              Razgandeste ({Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')})
                                            </button>
                                            <button
                                              onClick={() => handleFinalizeAccept(selectedConv.productId, bid.id)}
                                              className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                            >
                                              Accepta nu mai astepta
                                            </button>
                                          </>
                                        ) : acceptedBidId === bid.id ? (
                                          <span className="px-4 py-2.5 rounded-full text-sm font-medium bg-green-500 text-white shadow-sm whitespace-nowrap">
                                            Acceptată
                                          </span>
                                        ) : (
                                          <button
                                            onClick={() => handleAcceptBid(selectedConv.productId, bid.id, bid.amount)}
                                            disabled={acceptedBidId !== null}
                                            className={`px-4 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95 ${
                                              acceptedBidId !== null
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : 'bg-red-500 hover:bg-red-600 text-white'
                                            }`}
                                          >
                                            Acceptă
                                          </button>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    // Pentru cumpărători - afișează butoanele Contraofertă, Acceptă și Refuză
                                    // Verifică dacă există orice ofertă acceptată complet (nu mai este în countdown)
                                    // Verifică atât state-ul local cât și is_winning din baza de date
                                    const acceptedBidForThis = acceptedBids[selectedConv.productId];
                                    const acceptedBidIdForThis = acceptedBidForThis?.bidId || null;
                                    const countdownForThis = countdowns[selectedConv.productId] || null;
                                    const hasWinningBid = selectedConv.bids?.some(b => b.is_winning === true) || false;
                                    const isAcceptedCompleteForBuyer = hasWinningBid || (acceptedBidIdForThis !== null && (countdownForThis === null || (countdownForThis || 0) <= 0));
                                    
                                    // Nu afișa butoanele dacă există orice ofertă acceptată complet
                                    if (isAcceptedCompleteForBuyer) return null;
                                    
                                    const sortedBids = [...selectedConv.bids].sort((a, b) => 
                                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                    );
                                    let consecutiveCounterOffers = 0;
                                    for (let i = sortedBids.length - 1; i >= 0; i--) {
                                      if (sortedBids[i].user_id === currentUserId) {
                                        consecutiveCounterOffers++;
                                      } else {
                                        break;
                                      }
                                    }
                                    
                                    return (
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                          onClick={() => {
                                            if (consecutiveCounterOffers === 1) {
                                              showNotificationRef.current.show('info', 'Informare', 'Ai făcut 99 contraoferte consecutive. Poți face maximum 100 contraoferte consecutive fără ca celălalt utilizator să răspundă. Dacă celălalt utilizator răspunde, vei putea face din nou până la 100 contraoferte.');
                                            }
                                            
                                            // Deschide modalul pentru contraofertă
                                            const userName = selectedConv.sellerInfo?.first_name && selectedConv.sellerInfo?.last_name
                                              ? `${selectedConv.sellerInfo.first_name} ${selectedConv.sellerInfo.last_name}`
                                              : selectedConv.sellerInfo?.username || selectedConv.sellerInfo?.email || 'Vânzător';
                                            setCounterOfferModalData({
                                              productId: selectedConv.productId,
                                              bidId: bid.id,
                                              currentAmount: bid.amount,
                                              currency: selectedConv.product.currency || 'RON',
                                              userName: userName
                                            });
                                            setCounterOfferAmountModal('');
                                            setShowCounterOfferModal(true);
                                          }}
                                          className="px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-full bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                        >
                                          Contraoferta
                                        </button>
                                        {/* Butoane Acceptă și Refuză pentru cumpărători */}
                                        {acceptedBidId === bid.id && countdown !== null && countdown > 0 ? (
                                          <>
                                            <button
                                              onClick={() => handleCancelAccept(selectedConv.productId, bid.id)}
                                              className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                            >
                                              Razgandeste ({Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')})
                                            </button>
                                            <button
                                              onClick={() => handleFinalizeAccept(selectedConv.productId, bid.id)}
                                              className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                            >
                                              Accepta nu mai astepta
                                            </button>
                                            <button
                                              onClick={() => handleRefuseBid(selectedConv.productId, bid.id, bid.amount)}
                                              className="px-3 md:px-4 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium bg-gray-500 hover:bg-gray-600 text-white shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95"
                                            >
                                              Refuză
                                            </button>
                                          </>
                                        ) : acceptedBidId === bid.id ? (
                                          <span className="px-4 py-2.5 rounded-full text-sm font-medium bg-green-500 text-white shadow-sm whitespace-nowrap">
                                            Acceptată
                                          </span>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => handleAcceptBid(selectedConv.productId, bid.id, bid.amount)}
                                              disabled={acceptedBidId !== null}
                                              className={`px-4 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95 ${
                                                acceptedBidId !== null
                                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                  : 'bg-red-500 hover:bg-red-600 text-white'
                                              }`}
                                            >
                                              Acceptă
                                            </button>
                                            <button
                                              onClick={() => {
                                                console.log('🔴 [Refuză Button - Chat] Clicked!', {
                                                  productId: selectedConv.productId,
                                                  bidId: bid.id,
                                                  amount: bid.amount
                                                });
                                                handleRefuseBid(selectedConv.productId, bid.id, bid.amount);
                                              }}
                                              className="px-4 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all whitespace-nowrap hover:scale-110 active:scale-95 bg-gray-500 hover:bg-gray-600 text-white"
                                            >
                                              Refuză
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      });
                      
                      // Renderează itemurile direct (fără mesaje de status separate)
                      return bidItems;
                    })()}
                    {/* Element pentru auto-scroll */}
                    <div ref={messagesEndRef} />
                    </div>
                  </div>
                  
                  {/* Input pentru mesaje */}
                  {(() => {
                    // Calculează conversationKey corect pentru input
                    const conversationKey = selectedConv.buyerId 
                      ? `${selectedConv.productId}-${selectedConv.buyerId}` // Received bids: productId-buyerId
                      : `${selectedConv.productId}-${selectedConv.sellerId}`; // Made bids: productId-sellerId
                    
                    // Verifică dacă chat-ul este blocat (privacy mode)
                    const blockState = blockedChats[conversationKey] || { blocked_by_seller: false, blocked_by_buyer: false };
                    const isSeller = selectedConv.product.user_id === currentUserId;
                    const isChatBlocked = blockState.blocked_by_seller || blockState.blocked_by_buyer;
                    const canUserUnblock = isSeller ? blockState.blocked_by_seller : blockState.blocked_by_buyer;
                    
                    // Verifică dacă utilizatorul este blocat (user blocking)
                    const targetUserId = selectedConv.buyerId && selectedConv.buyerId !== currentUserId
                      ? selectedConv.buyerId
                      : selectedConv.sellerId && selectedConv.sellerId !== currentUserId
                        ? selectedConv.sellerId
                        : null;
                    const isUserBlocked = targetUserId ? (blockedUsers.has(targetUserId) || usersBlockedMe.has(targetUserId)) : false;
                    
                    // Combinăm ambele verificări - chat-ul este blocat dacă privacy mode SAU utilizatorul este blocat
                    const isBlocked = isChatBlocked || isUserBlocked;
                    
                    return (
                      <div
                        className="p-3 border-t border-gray-200 bg-white"
                        style={{ paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px) + ${mobileBottomInset}px)` }}
                      >
                        {/* Preview imagini selectate */}
                        {imagePreviews[conversationKey] && imagePreviews[conversationKey].length > 0 && (
                          <div className="mb-2 flex gap-2 flex-wrap">
                            {imagePreviews[conversationKey].map((preview, index) => (
                              <div key={index} className="relative">
                                <img 
                                  src={preview} 
                                  alt={`Preview ${index + 1}`}
                                  className="w-20 h-20 object-cover rounded-lg border border-gray-300"
                                />
                                <button
                                  onClick={() => handleRemoveImage(conversationKey, index)}
                                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-0 md:gap-1 min-w-0 w-full" id={`chat-input-${conversationKey.replace(/[^a-zA-Z0-9]/g, '_')}`}>
                          {/* Buton Upload Imagini */}
                          <input
                            ref={(el) => {
                              if (el) fileInputRef.current[conversationKey] = el;
                            }}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleImageSelect(e, conversationKey)}
                            className="hidden"
                            disabled={isBlocked}
                          />
                          <button 
                            onClick={() => !isBlocked && fileInputRef.current[conversationKey]?.click()}
                            className={`flex-shrink-0 p-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:animate-bounce ${
                              (selectedImages[conversationKey]?.length || 0) > 0 || (imagePreviews[conversationKey]?.length || 0) > 0
                                ? 'text-green-500' 
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                            disabled={isBlocked}
                          >
                            <i className="ri-image-add-line text-xl"></i>
                          </button>
                          
                          {/* Buton pentru blocare/deblocare chat */}
                          <div className="relative group flex-shrink-0">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // Pe mobil: primul tap afișează tooltip-ul, al doilea execută acțiunea
                                if (showPrivacyModeTooltip === conversationKey) {
                                  // Al doilea tap - execută acțiunea
                                  setShowPrivacyModeTooltip(null);
                                  if (!isBlocked || canUserUnblock) {
                                    // Verifică dacă utilizatorul a ales să nu mai vadă confirmarea
                                    if (currentUserId) {
                                      const skipConfirmation = localStorage.getItem(`privacyModeSkipConfirmation_${currentUserId}`) === 'true';
                                      if (skipConfirmation) {
                                        // Activează direct fără modal
                                        await handleToggleChatBlock(conversationKey);
                                      } else {
                                        // Arată modal-ul de confirmare
                                        setPrivacyModeModalConversationKey(conversationKey);
                                        setPrivacyModeModalAction(isBlocked ? 'unblock' : 'block');
                                        setShowPrivacyModeModal(true);
                                      }
                                    } else {
                                      // Fallback dacă nu e userId disponibil
                                      setPrivacyModeModalConversationKey(conversationKey);
                                      setPrivacyModeModalAction(isBlocked ? 'unblock' : 'block');
                                      setShowPrivacyModeModal(true);
                                    }
                                  } else {
                                    showNotificationRef.current.show('info', 'Informare', 'Chat-ul este blocat de celălalt utilizator.');
                                  }
                                } else {
                                  // Primul tap - afișează tooltip-ul (doar pe mobil, dacă nu a optat să nu-l mai vadă)
                                  if (window.innerWidth < 768) {
                                    // Verifică dacă utilizatorul a optat să nu mai vadă tooltip-ul
                                    if (currentUserId) {
                                      const dontShowTooltip = localStorage.getItem(`privacyModeDontShowTooltip_${currentUserId}_${conversationKey}`) === 'true';
                                      if (!dontShowTooltip) {
                                        setShowPrivacyModeTooltip(conversationKey);
                                      } else {
                                        // Dacă a optat să nu-l vadă, execută direct acțiunea la primul tap
                                        if (!isBlocked || canUserUnblock) {
                                          const skipConfirmation = localStorage.getItem(`privacyModeSkipConfirmation_${currentUserId}`) === 'true';
                                          if (skipConfirmation) {
                                            await handleToggleChatBlock(conversationKey);
                                          } else {
                                            setPrivacyModeModalConversationKey(conversationKey);
                                            setPrivacyModeModalAction(isBlocked ? 'unblock' : 'block');
                                            setShowPrivacyModeModal(true);
                                          }
                                        } else {
                                          showNotificationRef.current.show('info', 'Informare', 'Chat-ul este blocat de celălalt utilizator.');
                                        }
                                      }
                                    } else {
                                      setShowPrivacyModeTooltip(conversationKey);
                                    }
                                  } else {
                                    // Pe desktop, execută direct acțiunea (comportament hover)
                                    if (!isBlocked || canUserUnblock) {
                                      if (currentUserId) {
                                        const skipConfirmation = localStorage.getItem(`privacyModeSkipConfirmation_${currentUserId}`) === 'true';
                                        if (skipConfirmation) {
                                          await handleToggleChatBlock(conversationKey);
                                        } else {
                                          setPrivacyModeModalConversationKey(conversationKey);
                                          setPrivacyModeModalAction(isBlocked ? 'unblock' : 'block');
                                          setShowPrivacyModeModal(true);
                                        }
                                      } else {
                                        setPrivacyModeModalConversationKey(conversationKey);
                                        setPrivacyModeModalAction(isBlocked ? 'unblock' : 'block');
                                        setShowPrivacyModeModal(true);
                                      }
                                    } else {
                                      showNotificationRef.current.show('info', 'Informare', 'Chat-ul este blocat de celălalt utilizator.');
                                    }
                                  }
                                }
                              }}
                              disabled={isBlocked && !canUserUnblock}
                              className={`p-2 rounded-lg transition-all hover:animate-bounce active:scale-95 ${
                                isBlocked && !canUserUnblock
                                  ? 'text-gray-400 cursor-not-allowed'
                                  : isBlocked && canUserUnblock
                                  ? 'text-green-500 hover:text-green-600 cursor-pointer'
                                  : 'text-gray-500 hover:text-gray-600 cursor-pointer'
                              }`}
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isBlocked ? (
                                  // Lacăt închis (lock closed) - ROȘU când este blocat
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                ) : (
                                  // Lacăt deschis (lock open) - VERDE când este deblocat
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                )}
                              </svg>
                            </button>
                            {/* Tooltip */}
                            <div className={`absolute bottom-full left-0 mb-2 px-3 py-2 text-xs text-gray-800 bg-white border border-gray-200 rounded-none shadow-xl transition-opacity duration-200 pointer-events-none z-[9999] min-w-[300px] max-w-[calc(100vw-2rem)] md:max-w-[600px] text-left break-words whitespace-normal ${showPrivacyModeTooltip === conversationKey ? 'opacity-100' : 'opacity-0 md:opacity-0 md:group-hover:opacity-100'}`}>
                              <div className="pointer-events-auto">
                                {isBlocked && canUserUnblock ? (
                                  <span className="font-bold text-green-500">Chat Privacy Mode: Este activ.</span>
                                ) : !isBlocked ? (
                                  <span className="font-bold text-gray-500">Chat Privacy Mode:</span>
                                ) : (
                                  <span className="font-bold text-gray-500">Chat Privacy Mode:</span>
                                )}
                                {' '}
                                {isBlocked && canUserUnblock ? (
                                  <span>Chat-ul este blocat. Poți debloca chat-ul oricând vrei - click pentru a permite mesaje text în chat.</span>
                                ) : !isBlocked ? (
                                  <span>Blochează chat-ul. Click pentru a permite doar oferte și contraoferte, fără mesaje text până când se ajunge la un consens.</span>
                                ) : (
                                  <span>Chat-ul este blocat de celălalt utilizator. Nu poți debloca chat-ul decât dacă tu l-ai blocat.</span>
                                )}
                                {/* Buton "Am înțeles" */}
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (currentUserId) {
                                      localStorage.setItem(`privacyModeDontShowTooltip_${currentUserId}_${conversationKey}`, 'true');
                                    }
                                    setShowPrivacyModeTooltip(null);
                                  }}
                                  className="mt-2 w-full px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 transition-colors"
                                >
                                  Am înțeles, nu mai afișa
                                </button>
                              </div>
                              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                            </div>
                          </div>
                          
                          <input
                            type="text"
                            value={newCounterOfferAmount[conversationKey] || ''}
                            onChange={(e) => {
                              setNewCounterOfferAmount(prev => ({
                                ...prev,
                                [conversationKey]: e.target.value
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && !isBlocked) {
                                e.preventDefault();
                                const messageText = newCounterOfferAmount[conversationKey] || '';
                                const hasImages = (selectedImages[conversationKey]?.length || 0) > 0;
                                if (messageText.trim() || hasImages) {
                                  handleSendMessage(conversationKey, messageText, selectedImages[conversationKey]);
                                }
                              }
                            }}
                            placeholder={isUserBlocked ? "Comunicarea este blocată cu acest utilizator." : (isChatBlocked ? "Chat-ul este blocat. Folosiți ofertele și contraofertele pentru negociere." : "Scrie un mesaj aici")}
                            disabled={isBlocked}
                            autoFocus={false}
                            autoComplete="off"
                            className={`flex-1 min-w-0 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation ${
                              isBlocked ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white'
                            }`}
                            style={{ fontSize: '16px' }}
                          />
                          <button
                            onClick={() => {
                              const messageText = newCounterOfferAmount[conversationKey] || '';
                              const hasImages = (selectedImages[conversationKey]?.length || 0) > 0;
                              if ((messageText.trim() || hasImages) && !isBlocked) {
                                handleSendMessage(conversationKey, messageText, selectedImages[conversationKey]);
                              }
                            }}
                            disabled={(!newCounterOfferAmount[conversationKey]?.trim() && !(selectedImages[conversationKey]?.length || 0)) || isBlocked}
                            className="flex-shrink-0 w-15 h-15 rounded-full transition-all flex items-center justify-center bg-transparent hover:scale-105 active:scale-95"
                            style={{ width: '60px', height: '60px' }}
                            title="Trimite mesaj"
                          >
                            <i className={`ri-send-plane-fill text-3xl transition-colors ${
                              (newCounterOfferAmount[conversationKey]?.trim() || (selectedImages[conversationKey]?.length || 0) > 0) && !isBlocked
                                ? 'text-blue-500'
                                : 'text-gray-400'
                            }`}></i>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              </div>
            ) : (
              /* Pe mobil nu afișăm placeholder-ul ca să rămână vizibil panoul stâng (listă sau mesajul "Nu ai nicio ofertă") */
              <div className="hidden md:flex flex-1 items-center justify-center bg-white">
                <div className="text-center text-gray-500">
                  <p className="text-lg font-medium mb-2">Selectează o ofertă</p>
                  <p className="text-sm">Alege o ofertă din lista pentru a vedea detaliile</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recently Viewed Products Section - Desktop Only */}
      {recentlyViewedProducts.length > 0 && (
        <div className={`hidden md:block mt-8 sm:mt-12 ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-5 sm:p-7 shadow-xl border ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-4">
              {/* Icon Container with Gradient */}
              <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30' 
                  : 'bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200/50'
              }`}>
                <i className={`ri-history-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent`}></i>
                {/* Shine effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500"></div>
              </div>
              
              {/* Title with Gradient */}
              <div className="flex flex-col">
                <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                  isDarkMode 
                    ? 'from-white via-gray-100 to-gray-300' 
                    : 'from-gray-900 via-gray-800 to-gray-700'
                } bg-clip-text text-transparent`}>
                  Produse vizionate recent
                </h2>
                <p className={`text-xs sm:text-sm mt-1 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {recentlyViewedProducts.length} {recentlyViewedProducts.length === 1 ? 'produs' : 'produse'} în istoric
                </p>
              </div>
            </div>
            
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('recentlyViewedProducts');
                  setRecentlyViewedProducts([]);
                }
              }}
              className={`text-xs sm:text-sm px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                isDarkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700/50 hover:border-gray-600/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200/50 hover:border-gray-300/50'
              }`}
            >
              <i className="ri-delete-bin-line mr-1.5"></i>
              Șterge istoricul
            </button>
          </div>
          <div className="relative group">
            {/* Gradient Fade Left */}
            <div className={`absolute left-0 top-0 bottom-0 w-16 z-20 pointer-events-none bg-gradient-to-r ${
              isDarkMode ? 'from-gray-800 to-transparent' : 'from-white to-transparent'
            }`}></div>
            
            {/* Gradient Fade Right */}
            <div className={`absolute right-0 top-0 bottom-0 w-16 z-20 pointer-events-none bg-gradient-to-l ${
              isDarkMode ? 'from-gray-800 to-transparent' : 'from-white to-transparent'
            }`}></div>

            {/* Left Arrow - Modern Design */}
            <button
              onClick={() => {
                if (recentlyViewedScrollRef.current) {
                  recentlyViewedScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                }
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                isDarkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                  : 'bg-white/90 hover:bg-white border-gray-200/50 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
              }`}
              style={{
                boxShadow: isDarkMode 
                  ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                  : '0 8px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
              aria-label="Scroll left"
            >
              <i className="ri-arrow-left-s-line text-2xl"></i>
            </button>

            {/* Right Arrow - Modern Design */}
            <button
              onClick={() => {
                if (recentlyViewedScrollRef.current) {
                  recentlyViewedScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                }
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                isDarkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                  : 'bg-white/90 hover:bg-white border-gray-200/50 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
              }`}
              style={{
                boxShadow: isDarkMode 
                  ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                  : '0 8px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
              aria-label="Scroll right"
            >
              <i className="ri-arrow-right-s-line text-2xl"></i>
            </button>

            <div ref={recentlyViewedScrollRef} className="overflow-x-auto pb-4 -mx-2 px-2 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex gap-4 sm:gap-5 min-w-max py-2">
                {recentlyViewedProducts.slice(0, 10).map((product) => {
                  const productUrl = product.url || (product.slug ? `/live_bid/${product.slug}` : '#');
                  const firstImage = Array.isArray(product.image) 
                    ? (product.image[0] || (typeof product.image === 'string' ? product.image : ''))
                    : (product.image || '');
                  
                  return (
                    <a
                      key={product.id}
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group relative flex-shrink-0 w-[150px] sm:w-[170px] md:w-[190px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${
                        isDarkMode 
                          ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50 hover:border-gray-600' 
                          : 'bg-gradient-to-br from-white to-gray-50/50 border border-gray-200/50 hover:border-gray-300'
                      }`}
                      style={{
                        boxShadow: isDarkMode
                          ? '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)'
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                          : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)'
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      }}
                    >
                      {/* Image Container with Overlay */}
                      <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
                        {firstImage ? (
                          <>
                            <img
                              src={firstImage}
                              alt={product.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                            {/* Gradient Overlay on Hover */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </>
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${
                            isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                            <i className={`ri-image-line text-4xl ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-400'
                            }`}></i>
                          </div>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="p-3 sm:p-4">
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {product.title}
                        </h3>
                        {product.price !== undefined && (
                          <p className={`text-sm sm:text-base font-bold mb-2 ${
                            isDarkMode ? 'text-blue-400' : 'text-blue-600'
                          }`}>
                            {new Intl.NumberFormat('ro-RO', {
                              style: 'currency',
                              currency: product.currency || 'RON',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            }).format(product.price)}
                          </p>
                        )}
                        <p className={`text-xs flex items-center gap-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          <i className="ri-time-line"></i>
                          {(() => {
                            const viewedDate = new Date(product.viewedAt);
                            const now = new Date();
                            const diffMs = now.getTime() - viewedDate.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            
                            if (diffMins < 1) return 'acum';
                            if (diffMins < 60) return `acum ${diffMins} min`;
                            if (diffHours < 24) return `acum ${diffHours} h`;
                            if (diffDays === 1) return 'ieri';
                            if (diffDays < 7) return `acum ${diffDays} zile`;
                            return viewedDate.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                          })()}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer - ascuns doar pe mobil */}
      <div className="max-md:hidden mt-12">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>

      {/* Notification Modal */}
      {showNotificationModal && notificationModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }}
          onClick={() => {
            setShowNotificationModal(false);
            setNotificationModal(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 transform transition-all"
            style={{
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon și titlu */}
            <div className="flex flex-col items-center mb-4">
              <div className={`mb-3 ${
                notificationModal.type === 'error' ? 'text-red-500' :
                notificationModal.type === 'success' ? 'text-green-500' : 'text-blue-500'
              }`}>
                {notificationModal.type === 'error' ? (
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : notificationModal.type === 'success' ? (
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <h3 className={`text-xl font-bold mb-1 ${
                notificationModal.type === 'error' ? 'text-red-600' :
                notificationModal.type === 'success' ? 'text-green-600' : 'text-blue-600'
              }`}>
                {notificationModal.title}
              </h3>
              <p className="text-gray-700 text-center text-sm leading-relaxed">
                {notificationModal.message}
              </p>
            </div>
            
            {/* Buton OK */}
            <button
              onClick={() => {
                setShowNotificationModal(false);
                setNotificationModal(null);
              }}
              className={`w-full py-2.5 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95 ${
                notificationModal.type === 'error' 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : notificationModal.type === 'success'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
              style={{
                boxShadow: notificationModal.type === 'error' 
                  ? '0 4px 6px -1px rgba(239, 68, 68, 0.3), 0 2px 4px -1px rgba(239, 68, 68, 0.2)'
                  : notificationModal.type === 'success'
                  ? '0 4px 6px -1px rgba(34, 197, 94, 0.3), 0 2px 4px -1px rgba(34, 197, 94, 0.2)'
                  : '0 4px 6px -1px rgba(59, 130, 246, 0.3), 0 2px 4px -1px rgba(59, 130, 246, 0.2)'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmare modul privacy */}
      {showPrivacyModeModal && privacyModeModalConversationKey && privacyModeModalAction && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }}
          onClick={() => {
            setShowPrivacyModeModal(false);
            setPrivacyModeModalConversationKey(null);
            setPrivacyModeModalAction(null);
            setPrivacyModeSkipConfirmation(false);
          }}
        >
          <div 
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white transform transition-all"
            style={{
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              {/* Icon mare în centru */}
              <div className="flex justify-center mb-6">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${
                  privacyModeModalAction === 'block' ? 'bg-red-100' : 'bg-green-100'
                }`}>
                  <svg className={`w-10 h-10 ${
                    privacyModeModalAction === 'block' ? 'text-red-600' : 'text-green-600'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {privacyModeModalAction === 'block' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    )}
                  </svg>
                </div>
              </div>
              
              {/* Titlu și mesaj */}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {privacyModeModalAction === 'block' ? 'Activează modul privacy' : 'Dezactivează modul privacy'}
                </h3>
                <p className="text-base text-gray-700 leading-relaxed">
                  {privacyModeModalAction === 'block' 
                    ? 'Aceasta va bloca mesajele text. Vei putea comunica doar prin oferte și contraoferte până când se ajunge la un consens.'
                    : 'Aceasta va permite din nou mesajele text în chat.'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Poți dezactiva modul privacy oricând dorești.
                </p>
              </div>

              {/* Checkbox pentru "Nu mai întreba" */}
              <div className="mb-8">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyModeSkipConfirmation}
                    onChange={(e) => setPrivacyModeSkipConfirmation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700">
                    Nu mai întreba și activează direct
                  </span>
                </label>
              </div>
              
              {/* Butoane */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPrivacyModeModal(false);
                    setPrivacyModeModalConversationKey(null);
                    setPrivacyModeModalAction(null);
                    setPrivacyModeSkipConfirmation(false);
                  }}
                  className="flex-1 px-6 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 active:scale-95"
                  style={{
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                >
                  Anulează
                </button>
                <button
                  onClick={async () => {
                    if (privacyModeModalConversationKey && currentUserId) {
                      // Salvează preferința dacă e bifat checkbox-ul
                      if (privacyModeSkipConfirmation) {
                        localStorage.setItem(`privacyModeSkipConfirmation_${currentUserId}`, 'true');
                      }
                      
                      await handleToggleChatBlock(privacyModeModalConversationKey);
                    setShowPrivacyModeModal(false);
                    setPrivacyModeModalConversationKey(null);
                    setPrivacyModeModalAction(null);
                    setPrivacyModeSkipConfirmation(false);
                  }
                }}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold text-white transition-all duration-200 active:scale-95 ${
                  privacyModeModalAction === 'block' 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-green-500 hover:bg-green-600'
                }`}
                style={{
                  boxShadow: privacyModeModalAction === 'block'
                    ? '0 4px 6px -1px rgba(239, 68, 68, 0.3), 0 2px 4px -1px rgba(239, 68, 68, 0.2)'
                    : '0 4px 6px -1px rgba(34, 197, 94, 0.3), 0 2px 4px -1px rgba(34, 197, 94, 0.2)'
                }}
              >
                {privacyModeModalAction === 'block' ? 'Activează' : 'Dezactivează'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal pentru raportare */}
      {showReportModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ 
            backdropFilter: 'blur(12px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)' 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowReportModal(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" stroke="white" strokeWidth="2.5"/>
                    <circle cx="12" cy="16" r="1" fill="white"/>
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Raportare utilizator</h2>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Formular */}
            <form className="p-6 space-y-6" onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (!sessionData.session) {
                  if (showNotificationRef.current) {
                    showNotificationRef.current.show('error', 'Eroare', 'Trebuie să fii autentificat pentru a trimite un raport.');
                  }
                  return;
                }

                const conv = allConversations.find(c => {
                  const keyForConv = c.buyerId 
                    ? `${c.productId}-${c.buyerId}`
                    : `${c.productId}-${c.sellerId}`;
                  return keyForConv === reportForm.conversationId;
                });

                const targetUserId = conv && conv.buyerId && conv.buyerId !== currentUserId
                  ? conv.buyerId
                  : conv && conv.sellerId && conv.sellerId !== currentUserId
                    ? conv.sellerId
                    : null;

                const response = await dashboardApiFetch('/api/user/report', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    productTitle: reportForm.productTitle,
                    reportedUserName: reportForm.reportedUserName,
                    reporterName: reportForm.reporterName,
                    reason: reportForm.reason,
                    description: reportForm.description,
                    conversationId: reportForm.conversationId,
                    productId: conv?.productId || null,
                    reportedUserId: targetUserId || null,
                  }),
                });

                if (!response.ok) {
                  let errorData;
                  try {
                    errorData = await response.json();
                  } catch (e) {
                    const text = await response.text();
                    errorData = { error: text || `Status ${response.status}` };
                  }
                  console.error('[Report] API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData
                  });
                  throw new Error(errorData.error || errorData.details || `Eroare la trimiterea raportului (Status: ${response.status})`);
                }

                setShowReportModal(false);
                setReportForm({
                  productTitle: '',
                  reportedUserName: '',
                  reporterName: '',
                  reason: '',
                  description: '',
                  conversationId: '',
                });

                // Reîncarcă conversațiile de rapoarte
                await loadReportChats();

                if (showNotificationRef.current) {
                  showNotificationRef.current.show('success', 'Raport trimis', 'Raportul a fost trimis cu succes. Vom examina problema în cel mai scurt timp. Poți vedea răspunsurile în conversația cu "Raportare Useri".');
                }
              } catch (error: any) {
                console.error('[Report] Error:', error);
                if (showNotificationRef.current) {
                  showNotificationRef.current.show('error', 'Eroare', error.message || 'Nu s-a putut trimite raportul. Te rugăm să încerci din nou.');
                }
              }
            }}>
              {/* Informații auto-completate (read-only) */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Informații despre raport</h3>
                
                {/* Titlu produs */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Produs raportat</label>
                  <input
                    type="text"
                    value={reportForm.productTitle}
                    readOnly
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none cursor-not-allowed"
                  />
                </div>

                {/* Utilizator raportat */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Utilizator raportat</label>
                  <input
                    type="text"
                    value={reportForm.reportedUserName}
                    readOnly
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none cursor-not-allowed"
                  />
                </div>

                {/* Utilizator care raportează */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Raportat de</label>
                  <input
                    type="text"
                    value={reportForm.reporterName}
                    readOnly
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Motivul raportării */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Motivul raportării <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportForm.reason}
                  onChange={(e) => setReportForm(prev => ({ ...prev, reason: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">Selectează un motiv</option>
                  <option value="spam">Spam sau mesaje nedorite</option>
                  <option value="harassment">Hărțuire sau comportament abuziv</option>
                  <option value="fake">Cont fals sau fraudulos</option>
                  <option value="inappropriate">Conținut neadecvat</option>
                  <option value="scam">Înșelătorie sau scam</option>
                  <option value="other">Alt motiv</option>
                </select>
              </div>

              {/* Descriere */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Descriere detaliată <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reportForm.description}
                  onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  rows={5}
                  placeholder="Descrie în detaliu motivul raportării. Includă exemple concrete și orice informație relevantă care ne poate ajuta să investigăm problema..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
                <p className="mt-1.5 text-xs text-gray-500">Minim 20 de caractere</p>
              </div>

              {/* Butoane */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={!reportForm.reason || !reportForm.description || reportForm.description.length < 20}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  Trimite raportul
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal pentru imagini cu galerie */}
      {imageModalUrls.length > 0 && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ 
            backdropFilter: 'blur(12px)', 
            WebkitBackdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
          }}
          onClick={() => {
            setImageModalUrls([]);
            setImageModalCurrentIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setImageModalUrls([]);
              setImageModalCurrentIndex(0);
            } else if (e.key === 'ArrowLeft' && imageModalUrls.length > 1) {
              setImageModalCurrentIndex(prev => (prev > 0 ? prev - 1 : imageModalUrls.length - 1));
            } else if (e.key === 'ArrowRight' && imageModalUrls.length > 1) {
              setImageModalCurrentIndex(prev => (prev < imageModalUrls.length - 1 ? prev + 1 : 0));
            }
          }}
          tabIndex={0}
        >
          <div 
            className="relative w-full h-full max-w-7xl max-h-screen flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Buton închidere */}
            <button
              onClick={() => {
                setImageModalUrls([]);
                setImageModalCurrentIndex(0);
              }}
              className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-gray-500/60 hover:bg-green-500/80 text-white flex items-center justify-center transition-all backdrop-blur-sm"
              aria-label="Închide"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Săgeată stânga */}
            {imageModalUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImageModalCurrentIndex(prev => prev > 0 ? prev - 1 : imageModalUrls.length - 1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-gray-500/60 hover:bg-green-500/80 text-white flex items-center justify-center transition-all backdrop-blur-sm"
                aria-label="Imaginea anterioară"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Săgeată dreapta */}
            {imageModalUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImageModalCurrentIndex(prev => prev < imageModalUrls.length - 1 ? prev + 1 : 0);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-gray-500/60 hover:bg-green-500/80 text-white flex items-center justify-center transition-all backdrop-blur-sm"
                aria-label="Imaginea următoare"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Imagine principală și thumbnails */}
            <div className="flex-1 flex items-center justify-center w-full px-4 md:px-20 py-4">
              {/* Container relativ pentru imagine și thumbnails */}
              <div className="relative flex items-center justify-center max-w-full max-h-full">
                {/* Imagine principală */}
                <img
                  id={`gallery-main-image-${imageModalCurrentIndex}`}
                  src={imageModalUrls[imageModalCurrentIndex]}
                  alt={`Imagine chat ${imageModalCurrentIndex + 1}`}
                  className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                />

                {/* Buton fullscreen - doar pe mobil */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const imgElement = document.getElementById(`gallery-main-image-${imageModalCurrentIndex}`);
                    if (imgElement) {
                      try {
                        if (imgElement.requestFullscreen) {
                          await imgElement.requestFullscreen();
                        } else if ((imgElement as any).webkitRequestFullscreen) {
                          await (imgElement as any).webkitRequestFullscreen();
                        } else if ((imgElement as any).mozRequestFullScreen) {
                          await (imgElement as any).mozRequestFullScreen();
                        } else if ((imgElement as any).msRequestFullscreen) {
                          await (imgElement as any).msRequestFullscreen();
                        }
                      } catch (error) {
                        console.error('Error requesting fullscreen:', error);
                      }
                    }
                  }}
                  className="md:hidden absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-gray-500/60 hover:bg-green-500/80 text-white flex items-center justify-center transition-all backdrop-blur-sm"
                  aria-label="Fullscreen"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>

                {/* Thumbnails gallery - exact în partea de jos a pozei */}
                {imageModalUrls.length > 1 && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full flex gap-2 px-4 py-2 bg-gray-500/60 rounded-lg backdrop-blur-sm max-w-[90vw] overflow-x-auto mt-0">
                    {imageModalUrls.map((url, index) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageModalCurrentIndex(index);
                        }}
                        className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                          index === imageModalCurrentIndex
                            ? 'border-green-500 scale-110'
                            : 'border-transparent opacity-60 hover:opacity-100 hover:border-green-500/50'
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Contor imagini */}
            {imageModalUrls.length > 1 && (
              <div className="absolute top-20 right-4 bg-gray-500/60 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
                {imageModalCurrentIndex + 1} / {imageModalUrls.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal contraoferta */}
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
            setCounterOfferAmountModal('');
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
                      const current = parseFloat(counterOfferAmountModal) || counterOfferModalData.currentAmount || 0;
                      const newAmount = Math.max(0, current - 10);
                      setCounterOfferAmountModal(newAmount.toString());
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
                      value={counterOfferAmountModal || ''}
                      onChange={(e) => {
                        const value: string = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setCounterOfferAmountModal(value);
                        }
                      }}
                      placeholder={new Intl.NumberFormat('ro-RO', {
                        style: 'currency',
                        currency: counterOfferModalData.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(counterOfferModalData.currentAmount || 0)}
                      className={`w-full text-center text-4xl font-bold bg-transparent outline-none ${
                        isDarkMode ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'
                      }`}
                      autoFocus
                    />
                  </div>
                  
                  <button
                    onClick={() => {
                      const current = parseFloat(counterOfferAmountModal) || counterOfferModalData.currentAmount || 0;
                      const newAmount = current + 10;
                      setCounterOfferAmountModal(newAmount.toString());
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
                    setCounterOfferAmountModal('');
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
                  onClick={handleCounterOfferFromModal}
                  className="flex-1 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  Confirmă contraoferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmare ștergere conversație */}
      {showDeleteConversationModal && deleteConversationKey && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }}
          onClick={() => {
            setShowDeleteConversationModal(false);
            setDeleteConversationKey(null);
            setDeleteConversationIsReport(false);
          }}
        >
          <div 
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white transform transition-all"
            style={{
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              {/* Icon mare în centru */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
                  <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </div>
              
              {/* Titlu */}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  Ești sigur că vrei să ștergi conversația?
                </h3>
              </div>
              
              {/* Butoane */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConversationModal(false);
                    setDeleteConversationKey(null);
                    setDeleteConversationIsReport(false);
                  }}
                  className="flex-1 px-6 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-200 active:scale-95"
                  style={{
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                >
                  Anulează
                </button>
                <button
                  onClick={async () => {
                    if (deleteConversationKey) {
                      if (deleteConversationIsReport) {
                        // Șterge conversația de raportare
                        await hideReportChat(deleteConversationKey);
                      } else {
                        // Șterge conversația normală
                        await hideConversation(deleteConversationKey);
                      }
                    }
                    setShowDeleteConversationModal(false);
                    setDeleteConversationKey(null);
                    setDeleteConversationIsReport(false);
                  }}
                  className="flex-1 px-6 py-3 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-all duration-200 active:scale-95"
                  style={{
                    boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3), 0 2px 4px -1px rgba(239, 68, 68, 0.2)'
                  }}
                >
                  Șterge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

