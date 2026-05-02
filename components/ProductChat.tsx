"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface ProductChatProps {
  productId: string;
  buyerId: string;
  sellerId: string;
  currentUserId: string;
  isDarkMode: boolean;
  onClose?: () => void;
  otherUserInfo?: {
    name: string;
    avatar?: string;
  };
}

interface Message {
  id: string;
  sender_user_id: string | null;
  message_text: string;
  created_at: string;
  is_read: boolean;
  is_system_message?: boolean;
}

interface Chat {
  id: string;
  product_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  communication_preference?: 'chat' | 'offers_only';
}

const ProductChat: React.FC<ProductChatProps> = ({
  productId,
  buyerId,
  sellerId,
  currentUserId,
  isDarkMode,
  onClose,
  otherUserInfo,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    name: string;
    avatar?: string;
  } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [userProfiles, setUserProfiles] = useState<Record<string, {
    name: string;
    avatar?: string;
    rating?: number;
    reviewCount?: number;
    isOnline?: boolean;
  }>>({});
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [communicationPreference, setCommunicationPreference] = useState<'chat' | 'offers_only'>('chat');
  const [showOffersOnlyTooltip, setShowOffersOnlyTooltip] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Încarcă informațiile utilizatorului curent și ale celuilalt utilizator
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        // Încarcă profilul utilizatorului curent
        const { data: currentProfile, error: currentProfileError } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, avatar_url, username')
          .eq('user_id', currentUserId)
          .maybeSingle();

        // Nu loga obiecte de eroare goale sau fără mesaj util (ex. {} sau RLS nepermis)
        if (currentProfileError && currentProfileError.code !== 'PGRST116') {
          const msg = (currentProfileError as { message?: string }).message;
          const hasMessage = typeof msg === 'string' && msg.trim() !== '';
          const isEmpty = JSON.stringify(currentProfileError) === '{}';
          if (hasMessage && !isEmpty) {
            console.error('[ProductChat] Error loading current user profile:', currentProfileError);
          }
        }

        if (currentProfile) {
          // Construiește numele: first_name + last_name > username > "Utilizator"
          const fullName = `${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim();
          const displayName = fullName || currentProfile.username || 'Utilizator';
          setCurrentUserInfo({
            name: displayName,
            avatar: currentProfile.avatar_url || undefined,
          });
          setUserProfiles(prev => ({
            ...prev,
            [currentUserId]: {
              name: fullName,
              avatar: currentProfile.avatar_url || undefined,
            }
          }));
        } else {
          // Fallback la localStorage
          if (typeof window !== 'undefined') {
            const savedUserInfo = localStorage.getItem('userInfo');
            if (savedUserInfo) {
              try {
                const userInfo = JSON.parse(savedUserInfo);
                const fullName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || 'Utilizator';
                setCurrentUserInfo({
                  name: fullName,
                  avatar: userInfo.avatar || undefined,
                });
                setUserProfiles(prev => ({
                  ...prev,
                  [currentUserId]: {
                    name: fullName,
                    avatar: userInfo.avatar || undefined,
                  }
                }));
              } catch (e) {
                console.error('[ProductChat] Error parsing userInfo from localStorage:', e);
                setCurrentUserInfo({ name: 'Utilizator' });
                setUserProfiles(prev => ({
                  ...prev,
                  [currentUserId]: { name: 'Utilizator' }
                }));
              }
            } else {
              setCurrentUserInfo({ name: 'Utilizator' });
              setUserProfiles(prev => ({
                ...prev,
                [currentUserId]: { name: 'Utilizator' }
              }));
            }
          } else {
            setCurrentUserInfo({ name: 'Utilizator' });
            setUserProfiles(prev => ({
              ...prev,
              [currentUserId]: { name: 'Utilizator' }
            }));
          }
        }

        // Încarcă profilul celuilalt utilizator (buyer sau seller)
        const otherUserId = currentUserId === buyerId ? sellerId : buyerId;
        if (otherUserId) {
          // Dacă avem otherUserInfo din props, folosește-l
          if (otherUserInfo) {
            setUserProfiles(prev => ({
              ...prev,
              [otherUserId]: {
                name: otherUserInfo.name,
                avatar: otherUserInfo.avatar,
              }
            }));
          } else {
            // Altfel, încarcă din baza de date
            const { data: otherProfile, error: otherProfileError } = await supabase
              .from('user_profiles')
              .select('first_name, last_name, avatar_url')
              .eq('user_id', otherUserId)
              .maybeSingle();

            if (!otherProfileError && otherProfile) {
              // Construiește numele: first_name + last_name > "Utilizator"
              const fullName = `${otherProfile.first_name || ''} ${otherProfile.last_name || ''}`.trim();
              const otherFullName = fullName || 'Utilizator';
              setUserProfiles(prev => ({
                ...prev,
                [otherUserId]: {
                  name: otherFullName,
                  avatar: otherProfile.avatar_url || undefined,
                }
              }));
            } else {
              // Fallback dacă nu găsim profilul - nu setăm nimic, va rămâne "Utilizator" doar ca ultimă opțiune
              setUserProfiles(prev => ({
                ...prev,
                [otherUserId]: {
                  name: 'Utilizator',
                  avatar: undefined,
                }
              }));
            }
          }

          // Încarcă reviews pentru celălalt utilizator
          try {
            const { data: reviewsData, error: reviewsError } = await supabase
              .from('user_reviews')
              .select('rating')
              .eq('reviewed_user_id', otherUserId);

            if (!reviewsError && reviewsData && reviewsData.length > 0) {
              const avgRating =
                reviewsData.reduce(
                  (sum: number, r: { rating: number | null }) => sum + (r.rating || 0),
                  0,
                ) / reviewsData.length;
              setUserProfiles(prev => ({
                ...prev,
                [otherUserId]: {
                  ...prev[otherUserId],
                  rating: Math.round(avgRating * 10) / 10,
                  reviewCount: reviewsData.length,
                }
              }));
            } else {
              setUserProfiles(prev => ({
                ...prev,
                [otherUserId]: {
                  ...prev[otherUserId],
                  rating: 0,
                  reviewCount: 0,
                }
              }));
            }
          } catch (reviewsErr) {
            console.error('[ProductChat] Error loading reviews:', reviewsErr);
          }
        }
      } catch (error) {
        console.error('[ProductChat] Error loading user info:', error);
        setCurrentUserInfo({ name: 'Utilizator' });
      }
    };

    if (currentUserId) {
      loadUserInfo();
    }
  }, [currentUserId, buyerId, sellerId, otherUserInfo]);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Obține sau creează conversația
      const params = new URLSearchParams({
        productId: productId,
        buyerId: buyerId,
      });
      
      console.log('[ProductChat] Loading messages with params:', { productId, buyerId, sellerId, currentUserId });
      
      // Verifică dacă există session înainte de a face request
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[ProductChat] No session found before loading messages');
        setError('Nu ești autentificat. Te rugăm să te conectezi.');
        return;
      }
      
      console.log('[ProductChat] Session found, user ID:', sessionData.session.user.id);
      
      const response = await fetch(
        `/api/product-chat/messages?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include', // Include cookies pentru autentificare
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`, // Trimite access token în header
          },
        }
      );
      
      if (!response.ok) {
        let errorData: any = {};
        try {
          const text = await response.text();
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (e) {
          console.error('[ProductChat] Failed to parse error response:', e);
          errorData = { error: 'Unknown error' };
        }
        
        console.error('[ProductChat] Failed to load messages:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          productId,
          buyerId,
          sellerId,
          currentUserId
        });
        
        let errorMessage = 'Eroare la încărcarea mesajelor';
        if (response.status === 401) {
          errorMessage = 'Nu ești autentificat. Te rugăm să te conectezi.';
        } else if (response.status === 403) {
          errorMessage = errorData.error || 'Nu ai permisiunea de a accesa acest chat.';
        } else if (response.status === 404) {
          errorMessage = errorData.error || 'Chat-ul nu a fost găsit.';
        } else if (errorData.error) {
          errorMessage = typeof errorData.error === 'string' ? errorData.error : (errorData.details || 'Eroare necunoscută');
        } else if (errorData.details) {
          errorMessage = typeof errorData.details === 'string' ? errorData.details : 'Eroare necunoscută';
        }
        
        setError(errorMessage);
        return;
      }

      const data = await response.json();
      setChat(data.chat);
      setMessages(data.messages || []);
      chatIdRef.current = data.chat?.id || null;
      setCommunicationPreference(data.chat?.communication_preference || 'chat');
      setError(null);

      // Încarcă profilurile pentru toate mesajele
      if (data.messages && data.messages.length > 0) {
        const uniqueUserIds = new Set<string>();
        data.messages.forEach((msg: Message) => {
          if (msg.sender_user_id) {
            uniqueUserIds.add(msg.sender_user_id);
          }
        });

        // Încarcă profilurile pentru utilizatorii care nu sunt deja încărcați
        const userIdsToLoad = Array.from(uniqueUserIds).filter(id => !userProfiles[id]);
        if (userIdsToLoad.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, avatar_url')
            .in('user_id', userIdsToLoad);

          if (!profilesError && profiles) {
            const newProfiles: Record<string, { name: string; avatar?: string }> = {};
            profiles.forEach((profile: {
              user_id: string;
              first_name: string | null;
              last_name: string | null;
              avatar_url: string | null;
            }) => {
              // Construiește numele: first_name + last_name > "Utilizator"
              const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
              const displayName = fullName || 'Utilizator';
              newProfiles[profile.user_id] = {
                name: displayName,
                avatar: profile.avatar_url || undefined,
              };
            });
            setUserProfiles(prev => ({ ...prev, ...newProfiles }));
          }
        }
      }
    } catch (error: any) {
      console.error('[ProductChat] Error loading messages:', error);
      setError('Eroare la încărcarea mesajelor. Te rugăm să reîncerci.');
    } finally {
      setLoading(false);
    }
  }, [productId, buyerId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Supabase Realtime pentru mesaje live
  useEffect(() => {
    if (!chatIdRef.current) {
      console.log('[ProductChat] No chatId for Realtime subscription');
      return;
    }

    console.log('[ProductChat] Setting up Realtime subscription for chat:', chatIdRef.current);

    const channel = supabase
      .channel(`product-chat:${chatIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_chat_messages',
          filter: `chat_id=eq.${chatIdRef.current}`,
        },
        async (payload: RealtimePostgresChangesPayload<Message>) => {
          console.log('[ProductChat] Realtime event received:', payload.eventType, payload.new);
          
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as Message;
            console.log('[ProductChat] New message from Realtime:', newMessage);
            
            // Încarcă profilul utilizatorului dacă nu este deja încărcat (doar pentru mesaje non-sistem)
            if (newMessage.sender_user_id && !newMessage.is_system_message && !userProfiles[newMessage.sender_user_id]) {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('first_name, last_name, avatar_url')
                .eq('user_id', newMessage.sender_user_id)
                .maybeSingle();

              if (profile) {
                // Construiește numele: first_name + last_name > "Utilizator"
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                const displayName = fullName || 'Utilizator';
                setUserProfiles(prev => ({
                  ...prev,
                  [newMessage.sender_user_id!]: {
                    name: displayName,
                    avatar: profile.avatar_url || undefined,
                  }
                }));
              }
            }
            
            setMessages((prev) => {
              // Evită duplicatele
              if (prev.some((m) => m.id === newMessage.id)) {
                console.log('[ProductChat] Message already exists, skipping:', newMessage.id);
                return prev;
              }
              console.log('[ProductChat] Adding new message to state');
              return [...prev, newMessage];
            });
            // Scroll la final după mesaj nou
            setTimeout(() => scrollToBottom(), 100);
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as Message;
            console.log('[ProductChat] Message updated from Realtime:', updatedMessage);
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedMessage = payload.old as Message;
            console.log('[ProductChat] Message deleted from Realtime:', deletedMessage);
            setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
          }
        }
      )
      .subscribe((status: string) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[ProductChat] Realtime status:", status);
        }
        if (status === "SUBSCRIBED") {
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[ProductChat] Realtime indisponibil pentru mesaje (publication/RLS). Reîncarcă conversația dacă nu vezi mesaje noi."
          );
          return;
        }
        if (status === "CLOSED" && process.env.NODE_ENV === "development") {
          console.log("[ProductChat] Realtime channel closed");
        }
      });

    return () => {
      console.log('[ProductChat] Cleaning up Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [chatIdRef.current, userProfiles]);

  // Typing indicator prin Realtime (folosind broadcast)
  useEffect(() => {
    if (!chatIdRef.current) return;

    const typingChannel = supabase.channel(`product-chat-typing:${chatIdRef.current}`);
    typingChannelRef.current = typingChannel;

    // Ascultă pentru typing events
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload: { payload: { userId: string; isTyping: boolean; userName?: string } }) => {
        const { userId, isTyping, userName } = payload.payload;
        if (userId !== currentUserId) {
          if (isTyping) {
            setTypingUsers(prev => new Set(prev).add(userId));
            // Dacă nu avem numele, îl setăm
            if (userName && !userProfiles[userId]) {
              setUserProfiles(prev => ({
                ...prev,
                [userId]: { name: userName }
              }));
            }
          } else {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(userId);
              return newSet;
            });
          }
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ProductChat] Typing channel subscribed');
        }
      });

    return () => {
      supabase.removeChannel(typingChannel);
    };
  }, [chatIdRef.current, currentUserId, userProfiles]);

  // Trimite typing events când utilizatorul scrie
  useEffect(() => {
    if (!chatIdRef.current || !typingChannelRef.current) return;

    if (messageText.trim().length > 0) {
      // Trimite typing event
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: currentUserId,
          isTyping: true,
          userName: currentUserInfo?.name || 'Utilizator',
        },
      });

      // Anulează typing după 3 secunde de inactivitate
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        if (typingChannelRef.current) {
          typingChannelRef.current.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
              userId: currentUserId,
              isTyping: false,
            },
          });
        }
      }, 3000);
    } else {
      // Nu mai scrie, trimite stop typing
      if (typingChannelRef.current) {
        typingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: currentUserId,
            isTyping: false,
          },
        });
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [messageText, chatIdRef.current, currentUserId, currentUserInfo]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!messageText.trim() || sending) return;

    try {
      setSending(true);
      
      // Verifică dacă există session înainte de a trimite mesaj
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[ProductChat] No session found before sending message');
        alert('Nu ești autentificat. Te rugăm să te conectezi.');
        return;
      }
      
      console.log('[ProductChat] Sending message with session, user ID:', sessionData.session.user.id);
      
      const response = await fetch('/api/product-chat/messages', {
        method: 'POST',
        credentials: 'include', // Include cookies pentru autentificare
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`, // Trimite access token în header
        },
        body: JSON.stringify({
          chatId: chatIdRef.current,
          productId,
          buyerId,
          messageText: messageText.trim(),
        }),
      });

      if (!response.ok) {
        let errorData: any = {};
        let errorText = '';
        try {
          errorText = await response.text();
          if (errorText) {
            try {
              errorData = JSON.parse(errorText);
            } catch (parseError) {
              // Dacă nu este JSON, folosim textul direct
              errorData = { error: errorText || 'Unknown error' };
            }
          } else {
            errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (e) {
          console.error('[ProductChat] Failed to parse error response:', e);
          errorData = { 
            error: errorText || `HTTP ${response.status}: ${response.statusText}` || 'Unknown error' 
          };
        }
        
        console.error('[ProductChat] Failed to send message:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          errorText: errorText,
          productId,
          buyerId,
          sellerId,
          currentUserId,
          chatId: chatIdRef.current
        });
        
        const errorMessage = errorData.error || errorData.details || errorText || `Eroare la trimiterea mesajului (${response.status})`;
        
        // Dacă este eroare de cuvinte jignitoare, afișează un mesaj special
        if (response.status === 400 && (errorMessage.includes('cuvinte jignitoare') || errorMessage.includes('jignitoare'))) {
          alert('⚠️ Mesajul conține cuvinte jignitoare. Te rugăm să fii respectuos în conversație.');
        } else if (response.status === 500 && errorMessage.includes('migration')) {
          alert('⚠️ Eroare: Migrarea bazei de date nu a fost aplicată. Contactează administratorul.');
        } else {
          throw new Error(errorMessage);
        }
        return;
      }

      const data = await response.json();
      setMessageText('');
      
      console.log('[ProductChat] Message sent successfully:', data.message);
      
      // Adaugă mesajul instant în UI (optimistic update)
      // Realtime va actualiza dacă este necesar
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) {
            console.log('[ProductChat] Message already exists in state');
            return prev;
          }
          console.log('[ProductChat] Adding sent message to state immediately');
          return [...prev, data.message];
        });
        // Scroll la final după mesaj trimis
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch (error: any) {
      console.error('[ProductChat] Error sending message:', error);
      const errorMessage = error.message || 'Eroare la trimiterea mesajului. Te rugăm să încerci din nou.';
      alert(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Acum';
    if (minutes < 60) return `Acum ${minutes}m`;
    
    return date.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Obține informațiile celuilalt utilizator pentru header
  const otherUserId = currentUserId === buyerId ? sellerId : buyerId;
  const otherUserProfile = otherUserId ? userProfiles[otherUserId] : null;
  // Prioritizează otherUserInfo din props dacă există, apoi userProfiles, apoi fallback
  const otherUserName = otherUserInfo?.name || otherUserProfile?.name || 'Utilizator';
  const otherUserAvatar = otherUserInfo?.avatar || otherUserProfile?.avatar;
  const otherUserRating = otherUserProfile?.rating || 0;
  const otherUserReviewCount = otherUserProfile?.reviewCount || 0;

  // Funcție pentru a seta preferința de comunicare
  const handleSetCommunicationPreference = async (newPreference: 'chat' | 'offers_only') => {
    if (!chatIdRef.current) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('[ProductChat] No session found');
        return;
      }

      const wasOffersOnly = communicationPreference === 'offers_only';
      const willBeOffersOnly = newPreference === 'offers_only';

      console.log('[ProductChat] Setting preference:', {
        from: communicationPreference,
        to: newPreference,
        wasOffersOnly,
        willBeOffersOnly
      });

      // Actualizează preferința
      const response = await fetch(`/api/product-chat/chats/${chatIdRef.current}/preference`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ communication_preference: newPreference }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ProductChat] Failed to update preference:', errorText);
        alert('Eroare la actualizarea preferinței de comunicare. Te rugăm să încerci din nou.');
        return;
      }

      // Actualizează starea locală
      setCommunicationPreference(newPreference);
      
      // Trimite mesaj automat în funcție de schimbare
      let systemMessage = '';
      
      // Dacă se deblochează chatul (din offers_only în chat)
      if (wasOffersOnly && !willBeOffersOnly) {
        systemMessage = "Chatul a fost deblocat. Acum puteți comunica liber.";
      }
      // Dacă se blochează chatul (din chat în offers_only) - doar vânzătorul poate face asta
      else if (!wasOffersOnly && willBeOffersOnly && currentUserId === sellerId) {
        systemMessage = "Vânzătorul a ales să comunice doar prin oferte și contraoferte până când se ajunge la un consens. Vă rugăm să folosiți butonul de oferte/contraoferte pentru a negocia profesional.";
      }

      // Trimite mesajul de sistem dacă există
      if (systemMessage) {
        console.log('[ProductChat] Sending system message:', systemMessage);
        
        try {
          const messageResponse = await fetch('/api/product-chat/messages', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              chatId: chatIdRef.current,
              productId,
              buyerId,
              messageText: systemMessage,
              isSystemMessage: true, // Mesaj de sistem de la GoBid
            }),
          });

          if (!messageResponse.ok) {
            const errorText = await messageResponse.text();
            console.error('[ProductChat] Failed to send system message:', errorText);
          } else {
            console.log('[ProductChat] System message sent successfully');
            // Reîncarcă mesajele pentru a afișa mesajul nou
            setTimeout(() => {
              loadMessages();
            }, 300);
          }
        } catch (messageError) {
          console.error('[ProductChat] Error sending system message:', messageError);
        }
      }
    } catch (error) {
      console.error('[ProductChat] Error setting communication preference:', error);
      alert('Eroare la setarea preferinței de comunicare. Te rugăm să încerci din nou.');
    }
  };

  // Supabase Realtime Presence pentru status online
  useEffect(() => {
    if (!chatIdRef.current) return;

    const otherUserId = currentUserId === buyerId ? sellerId : buyerId;
    if (!otherUserId) return;

    const presenceChannel = supabase.channel(`product-chat-presence:${chatIdRef.current}`);
    presenceChannelRef.current = presenceChannel;

    // Trimite presence când utilizatorul este online
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const otherUserPresence = state[otherUserId];
        if (otherUserPresence && otherUserPresence.length > 0) {
          setOtherUserOnline(true);
        } else {
          setOtherUserOnline(false);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }: { key: string; newPresences: unknown[] }) => {
        if (key === otherUserId) {
          setOtherUserOnline(true);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: { key: string; leftPresences: unknown[] }) => {
        if (key === otherUserId) {
          setOtherUserOnline(false);
        }
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          // Trimite presence
          await presenceChannel.track({
            userId: currentUserId,
            online: true,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [chatIdRef.current, currentUserId, buyerId, sellerId]);

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${
        isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            {otherUserAvatar ? (
              <img
                src={otherUserAvatar}
                alt={otherUserName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-300 text-gray-700'
              }`}>
                {otherUserName[0].toUpperCase()}
              </div>
            )}
            {/* Bulina verde pentru status online */}
            {otherUserOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            )}
          </div>
          <div>
            <div className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {otherUserName}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {/* Stele pentru reviews */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <i
                    key={star}
                    className={`ri-star-${star <= Math.round(otherUserRating) ? 'fill' : 'line'} text-sm ${
                      star <= Math.round(otherUserRating)
                        ? 'text-yellow-400'
                        : isDarkMode
                        ? 'text-gray-600'
                        : 'text-gray-300'
                    }`}
                  ></i>
                ))}
                <span className={`text-xs ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  ({otherUserReviewCount})
                </span>
              </div>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-opacity-20 ${
              isDarkMode ? 'hover:bg-white text-gray-400' : 'hover:bg-gray-200 text-gray-600'
            }`}
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
              isDarkMode ? 'border-blue-400' : 'border-blue-600'
            }`}></div>
          </div>
        ) : error ? (
          <div className={`text-center py-8 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            <i className="ri-error-warning-line text-4xl mb-2"></i>
            <p className="font-medium mb-2">{error}</p>
            <button
              onClick={() => loadMessages()}
              className={`mt-4 px-4 py-2 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <i className="ri-refresh-line mr-2"></i>
              Reîncearcă
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <i className="ri-message-3-line text-4xl mb-2"></i>
            <p>Nu există mesaje încă. Începe conversația!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              // Detectează mesajele de sistem: fie prin flag, fie prin sender_user_id null, fie prin prefix [SYSTEM]
              const hasSystemPrefix = message.message_text?.startsWith('[SYSTEM]');
              const isSystemMessage = message.is_system_message || 
                                     message.sender_user_id === null || 
                                     hasSystemPrefix;
              
              // Elimină prefixul [SYSTEM] din text dacă există
              const displayText = hasSystemPrefix 
                ? message.message_text.replace(/^\[SYSTEM\]\s*/, '')
                : message.message_text;
              
              const isOwn = !isSystemMessage && message.sender_user_id === currentUserId;
              const senderProfile = isSystemMessage 
                ? { name: 'GoBid Notificare automată', avatar: undefined }
                : (userProfiles[message.sender_user_id || ''] || { name: 'Utilizator' });
              
              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Avatar - doar pentru mesajele altora și mesajele de sistem */}
                  {!isOwn && (
                    <div className="flex-shrink-0">
                      {isSystemMessage ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                        }`}>
                          <i className="ri-service-line text-sm"></i>
                        </div>
                      ) : senderProfile.avatar ? (
                        <img
                          src={senderProfile.avatar}
                          alt={senderProfile.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-300 text-gray-700'
                        }`}>
                          {senderProfile.name[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    {/* Numele utilizatorului - deasupra mesajului */}
                    <div className={`text-xs font-semibold mb-1 px-1 ${
                      isSystemMessage
                        ? isDarkMode ? 'text-blue-400' : 'text-blue-600'
                        : isOwn 
                        ? isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        : isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {isOwn ? (currentUserInfo?.name || 'Eu') : senderProfile.name}
                    </div>
                    
                    <div className={`rounded-2xl px-4 py-2 ${
                      isSystemMessage
                        ? isDarkMode
                          ? 'bg-blue-900/50 border border-blue-700 text-blue-100'
                          : 'bg-blue-50 border border-blue-200 text-blue-900'
                        : isOwn
                        ? isDarkMode
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-100'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {displayText}
                      </p>
                      <div className={`text-xs mt-1 ${
                        isSystemMessage
                          ? isDarkMode ? 'text-blue-300' : 'text-blue-700'
                          : isOwn
                          ? 'text-blue-100'
                          : isDarkMode
                          ? 'text-gray-400'
                          : 'text-gray-500'
                      }`}>
                        {formatTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Avatar - doar pentru mesajele proprii */}
                  {isOwn && (
                    <div className="flex-shrink-0">
                      {currentUserInfo?.avatar ? (
                        <img
                          src={currentUserInfo.avatar}
                          alt={currentUserInfo.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-300 text-gray-700'
                        }`}>
                          {currentUserInfo?.name[0].toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Typing indicator */}
            {typingUsers.size > 0 && (
              <div className="flex items-center gap-2 justify-start">
                <div className="flex-shrink-0">
                  {Array.from(typingUsers).map(userId => {
                    const typingUserProfile = userProfiles[userId] || { name: 'Utilizator' };
                    return typingUserProfile.avatar ? (
                      <img
                        key={userId}
                        src={typingUserProfile.avatar}
                        alt={typingUserProfile.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div key={userId} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-300 text-gray-700'
                      }`}>
                        {typingUserProfile.name[0].toUpperCase()}
                      </div>
                    );
                  })}
                </div>
                <div className={`rounded-2xl px-4 py-2 ${
                  isDarkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900'
                }`}>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium">
                        {Array.from(typingUsers).map(userId => userProfiles[userId]?.name || 'Utilizator').join(', ')}
                      </span>
                      <span className="text-sm">
                        {typingUsers.size === 1 ? 'scrie' : 'scriu'}
                      </span>
                      <div className="flex gap-1 ml-1">
                        <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></span>
                        <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '1.4s' }}></span>
                        <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '1.4s' }}></span>
                      </div>
                    </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Butoane rapide */}
      <div className={`px-4 py-2 border-b ${
        isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center gap-2">
          {/* Butonul de oferte/contraoferte - Doar pentru vânzător */}
          {currentUserId === sellerId && (
            <div className="relative flex-1">
              <button
                onClick={() => {
                  // Toggle: dacă este blocat, deblochează; dacă este deblocat, blochează
                  if (communicationPreference === 'offers_only') {
                    // Deblochează chatul
                    handleSetCommunicationPreference('chat');
                  } else {
                    // Blochează chatul
                    handleSetCommunicationPreference('offers_only');
                  }
                }}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  communicationPreference === 'offers_only'
                    ? isDarkMode
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                onMouseEnter={() => setShowOffersOnlyTooltip(true)}
                onMouseLeave={() => setShowOffersOnlyTooltip(false)}
              >
                <i className="ri-hand-coin-line mr-2"></i>
                {communicationPreference === 'offers_only' 
                  ? 'Chat blocat' 
                  : 'Blochează Chat (Doar Oferte/Contraoferte)'}
              </button>
              
              {/* Tooltip */}
              {showOffersOnlyTooltip && (
                <div className={`absolute bottom-full left-0 mb-2 w-80 p-3 rounded-lg shadow-lg z-50 ${
                  isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}>
                  <div className={`text-sm font-semibold mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {communicationPreference === 'offers_only' 
                      ? 'Deblochează Chat' 
                      : 'Preferință de comunicare'}
                  </div>
                  <div className={`text-xs space-y-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {communicationPreference === 'offers_only' ? (
                      <div>
                        Apasă butonul pentru a debloca chatul și a permite comunicarea liberă.
                      </div>
                    ) : (
                      <>
                        <div>
                          <strong>Vreau să primesc doar oferte și contraoferte:</strong> Nu am timp să vorbesc, prefer negocierea profesională prin oferte.
                        </div>
                        <div>
                          <strong>Aș vrea să folosesc doar să negociem profesional:</strong> Prin oferte și contraoferte, și să vorbim după dacă ajungem la un consens.
                        </div>
                      </>
                    )}
                  </div>
                  {communicationPreference !== 'offers_only' && (
                    <div className={`mt-2 text-xs ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Când activezi această opțiune, se va trimite automat un mesaj explicativ.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Butonul de blocare - doar pentru vânzător */}
          {currentUserId === sellerId && (
            <button
              onClick={() => setShowBlockModal(true)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isDarkMode
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
              title="Blochează utilizatorul"
            >
              <i className="ri-user-forbid-line"></i>
            </button>
          )}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className={`p-4 border-t ${
        isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={communicationPreference === 'offers_only' && currentUserId !== sellerId 
              ? "Vânzătorul preferă comunicare doar prin oferte/contraoferte. Folosește butonul de oferte pentru a negocia."
              : "Scrie un mesaj..."
            }
            className={`flex-1 px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 ${
              isDarkMode
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500'
            }`}
            disabled={sending || (communicationPreference === 'offers_only' && currentUserId !== sellerId)}
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sending || (communicationPreference === 'offers_only' && currentUserId !== sellerId)}
            className={`px-4 py-2 rounded-xl font-semibold transition-all ${
              messageText.trim() && !sending && !(communicationPreference === 'offers_only' && currentUserId !== sellerId)
                ? isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                : isDarkMode
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            {sending ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-send-plane-fill"></i>
            )}
          </button>
        </div>
      </form>

      {/* Modal modern pentru blocare */}
      {showBlockModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBlockModal(false);
            }
          }}
        >
          {/* Overlay cu backdrop blur */}
          <div 
            className={`absolute inset-0 ${
              isDarkMode ? 'bg-black/60' : 'bg-black/40'
            } backdrop-blur-sm transition-opacity`}
          />
          
          {/* Modal content */}
          <div 
            className={`relative w-full max-w-md rounded-2xl shadow-2xl transform transition-all duration-300 ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
            style={{
              animation: 'modalSlideIn 0.3s ease-out'
            }}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isDarkMode ? 'bg-red-900/30' : 'bg-red-100'
                }`}>
                  <i className={`ri-user-forbid-line text-2xl ${
                    isDarkMode ? 'text-red-400' : 'text-red-500'
                  }`}></i>
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Blochează utilizatorul
                  </h3>
                  <p className={`text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {otherUserName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBlockModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className={`text-base mb-6 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Ești sigur că vrei să blochezi acest utilizator? După blocare, nu vei mai putea primi mesaje sau oferte de la acesta.
              </p>
              
              <div className={`p-4 rounded-lg mb-6 ${
                isDarkMode 
                  ? 'bg-yellow-900/20 border border-yellow-800/50' 
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <div className="flex items-start gap-3">
                  <i className={`ri-information-line text-xl mt-0.5 ${
                    isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                  }`}></i>
                  <div>
                    <p className={`text-sm font-medium mb-1 ${
                      isDarkMode ? 'text-yellow-300' : 'text-yellow-800'
                    }`}>
                      Funcționalitatea de blocare va fi implementată în curând.
                    </p>
                    <p className={`text-xs ${
                      isDarkMode ? 'text-yellow-400/80' : 'text-yellow-700'
                    }`}>
                      Momentan, această acțiune nu va avea efect. Vei putea bloca utilizatorii în versiunile viitoare.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-3 p-6 border-t ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => setShowBlockModal(false)}
                disabled={blocking}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                } ${blocking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Anulează
              </button>
              <button
                onClick={async () => {
                  setBlocking(true);
                  // TODO: Implementare blocare utilizator
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulare delay
                  setBlocking(false);
                  setShowBlockModal(false);
                  
                  // Toast notification (opțional)
                  // Poți adăuga un toast aici dacă vrei
                }}
                disabled={blocking}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                } ${blocking ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {blocking ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    <span>Blocare...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-user-forbid-line"></i>
                    <span>Blochează</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductChat;

