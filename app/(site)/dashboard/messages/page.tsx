"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, RealtimePostgresChangesPayload, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { hasDashboardLocalAuthEvidence } from "@/lib/auth/resolveAccountType";
import ProductChat from "@/components/ProductChat";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { warnOnceOnRealtimeFailure } from "@/lib/realtime/logChannelFallback";

interface Chat {
  id: string;
  product_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  communication_preference?: 'chat' | 'offers_only';
  product?: {
    id: string;
    title: string;
    slug: string;
    images?: string[];
  };
  other_user?: {
    id: string;
    name: string;
    avatar?: string;
  };
  last_message?: {
    id: string;
    message_text: string;
    created_at: string;
    sender_user_id: string | null;
    is_system_message?: boolean;
  };
  unread_count?: number;
}

type ProductChatRow = Pick<
  Chat,
  | "id"
  | "product_id"
  | "buyer_user_id"
  | "seller_user_id"
  | "last_message_at"
  | "created_at"
  | "updated_at"
  | "communication_preference"
>;

type UnreadMessageRow = {
  sender_user_id?: string | null;
  is_system_message?: boolean | null;
};

export default function MessagesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  // Verifică autentificarea și încarcă conversațiile
  useEffect(() => {
    let cancelled = false;

    const loadChats = async () => {
      try {
        let {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            const { data: s2 } = await supabase.auth.getSession();
            session = s2.session;
          }
        }
        if (!session?.user) {
          if (hasDashboardLocalAuthEvidence()) {
            return;
          }
          router.push('/auth?mode=login');
          return;
        }

        const userId = session.user.id;
        setCurrentUserId(userId);

        // Încarcă conversațiile în care utilizatorul este implicat
        const { data: chatsData, error: chatsError } = await supabase
          .from('product_chats')
          .select('*')
          .or(`buyer_user_id.eq.${userId},seller_user_id.eq.${userId}`)
          .order('last_message_at', { ascending: false });

        if (chatsError) {
          console.error('Error loading chats:', chatsError);
          setLoading(false);
          return;
        }

        if (!chatsData || chatsData.length === 0) {
          setChats([]);
          setLoading(false);
          return;
        }

        // Încarcă detalii pentru fiecare conversație
        const enrichedChats = await Promise.all(
          chatsData.map(async (chat: ProductChatRow) => {
            // Determină celălalt utilizator
            const otherUserId = chat.buyer_user_id === userId 
              ? chat.seller_user_id 
              : chat.buyer_user_id;

            // Încarcă informații despre produs
            const { data: productData } = await supabase
              .from('products')
              .select('id, title, slug, images')
              .eq('id', chat.product_id)
              .single();

            // Încarcă informații despre celălalt utilizator
            const { data: otherUserData } = await supabase
              .from('user_profiles')
              .select('user_id, first_name, last_name, avatar_url')
              .eq('user_id', otherUserId)
              .maybeSingle();

            // Construiește numele utilizatorului: first_name + last_name > "Utilizator"
            const fullName = otherUserData 
              ? `${otherUserData.first_name || ''} ${otherUserData.last_name || ''}`.trim()
              : '';
            const otherUserName = fullName || 'Utilizator';

            // Încarcă ultimul mesaj
            const { data: lastMessageData } = await supabase
              .from('product_chat_messages')
              .select('id, message_text, created_at, sender_user_id, is_system_message')
              .eq('chat_id', chat.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            // Numără mesajele necitite (mesaje care nu sunt trimise de utilizatorul curent și nu sunt mesaje de sistem)
            const { data: allUnreadMessages } = await supabase
              .from('product_chat_messages')
              .select('id, sender_user_id, is_system_message')
              .eq('chat_id', chat.id)
              .eq('is_read', false)
              .or('is_system_message.is.null,is_system_message.eq.false');
            
            // Filtrează manual mesajele care nu sunt trimise de utilizatorul curent
            let unreadCount = 0;
            if (allUnreadMessages) {
              unreadCount = allUnreadMessages.filter((msg: UnreadMessageRow) =>
                msg.sender_user_id !== userId &&
                (msg.is_system_message === false || msg.is_system_message === null),
              ).length;
            }
            
            // Debug logging
            console.log('[Messages] Unread count for chat', chat.id, ':', unreadCount, 'userId:', userId);

            return {
              ...chat,
              product: productData || undefined,
              other_user: {
                id: otherUserId,
                name: otherUserName,
                avatar: otherUserData?.avatar_url || undefined,
              },
              last_message: lastMessageData || undefined,
              unread_count: unreadCount || 0,
            };
          })
        );

        if (!cancelled) {
          setChats(enrichedChats);
        }
      } catch (error) {
        console.error('Error loading chats:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!mounted) {
      return;
    }

    void loadChats();
    const retryTimer = setTimeout(() => {
      if (!cancelled) void loadChats();
    }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user && !cancelled) void loadChats();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      authListener.subscription.unsubscribe();
    };
  }, [mounted, router]);

  // Realtime subscription pentru mesaje noi și actualizări
  useEffect(() => {
    if (!currentUserId || !mounted) return;

    const warnRt = warnOnceOnRealtimeFailure(
      "Messages",
      "product_chat_messages",
      "Verifică publicația Realtime pentru tabel în Supabase."
    );

    console.log('[Messages] Setting up Realtime subscription for user:', currentUserId);

    const channel = supabase
      .channel('product_chat_messages_realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Ascultă pentru INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'product_chat_messages',
        },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Messages Realtime] Received event:', payload.eventType, payload.new || payload.old);
          
          const newMessage = payload.new as any;
          const oldMessage = payload.old as any;
          
          if (!newMessage && !oldMessage) return;

          const messageChatId = newMessage?.chat_id || oldMessage?.chat_id;
          if (!messageChatId) return;

          // Verifică dacă conversația este relevantă pentru utilizatorul curent
          const { data: chatData } = await supabase
            .from('product_chats')
            .select('id, buyer_user_id, seller_user_id, product_id')
            .eq('id', messageChatId)
            .single();

          if (!chatData || (chatData.buyer_user_id !== currentUserId && chatData.seller_user_id !== currentUserId)) {
            return; // Conversația nu este relevantă pentru utilizatorul curent
          }

          // Găsește conversația existentă în state
          setChats(prevChats => {
            const existingChat = prevChats.find(c => c.id === messageChatId);
            if (!existingChat) {
              // Dacă conversația nu există în state, o reîncărcăm complet
              return prevChats;
            }
            return prevChats;
          });

          // Reîncarcă datele pentru conversația afectată
          const otherUserId = chatData.buyer_user_id === currentUserId 
            ? chatData.seller_user_id 
            : chatData.buyer_user_id;

          const { data: productData } = await supabase
            .from('products')
            .select('id, title, slug, images')
            .eq('id', chatData.product_id)
            .single();

          const { data: otherUserData } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, username, avatar_url')
            .eq('user_id', otherUserId)
            .maybeSingle();

          // Construiește numele utilizatorului: first_name + last_name > "Utilizator"
          const fullName = otherUserData 
            ? `${otherUserData.first_name || ''} ${otherUserData.last_name || ''}`.trim()
            : '';
          const otherUserName = fullName || 'Utilizator';

          const { data: lastMessageData } = await supabase
            .from('product_chat_messages')
            .select('id, message_text, created_at, sender_user_id, is_system_message')
            .eq('chat_id', messageChatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Numără mesajele necitite
          const { data: allUnreadMessages } = await supabase
            .from('product_chat_messages')
            .select('id, sender_user_id, is_system_message')
            .eq('chat_id', messageChatId)
            .eq('is_read', false)
            .or('is_system_message.is.null,is_system_message.eq.false');
          
          let unreadCount = 0;
          if (allUnreadMessages) {
            unreadCount = allUnreadMessages.filter((msg: UnreadMessageRow) =>
              msg.sender_user_id !== currentUserId &&
              (msg.is_system_message === false || msg.is_system_message === null),
            ).length;
          }

          console.log('[Messages Realtime] Updating chat', messageChatId, 'with unread count:', unreadCount);

          // Actualizează conversația în state
          setChats(prevChats =>
            prevChats.map((chat: Chat) =>
            chat.id === messageChatId 
              ? {
                  ...chat,
                  product: productData || chat.product,
                  other_user: {
                    id: otherUserId,
                    name: otherUserName,
                    avatar: otherUserData?.avatar_url || chat.other_user?.avatar,
                  },
                  last_message: lastMessageData || chat.last_message,
                  unread_count: unreadCount,
                }
              : chat
          ));
        }
      )
      .subscribe((status: string) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[Messages Realtime] Subscription status:", status);
        }
        warnRt(status);
      });

    return () => {
      console.log('[Messages] Removing Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [currentUserId, mounted]);

  const handleOpenChat = (chat: Chat) => {
    setSelectedChat(chat);
  };

  const handleCloseChat = () => {
    setSelectedChat(null);
    // Reîncarcă conversațiile pentru a actualiza numărul de mesaje necitite
    window.location.reload();
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Acum';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}z`;
    return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  };

  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.product?.title?.toLowerCase().includes(query) ||
      chat.other_user?.name?.toLowerCase().includes(query) ||
      chat.last_message?.message_text?.toLowerCase().includes(query)
    );
  });

  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={() => router.push('/dashboard')}
      ></div>
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 pointer-events-none">
        <div 
          className={`w-full h-full md:w-full md:max-w-7xl md:h-[90vh] rounded-none md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden pointer-events-auto ${
            isDarkMode 
              ? 'bg-gray-900 border-0 md:border border-gray-700' 
              : 'bg-white border-0 md:border border-gray-200'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar - Lista de conversații */}
          <div className={`w-full md:w-80 border-b md:border-b-0 md:border-r flex flex-col ${
            isDarkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200'
          } ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Header Sidebar */}
          <div className={`p-3 md:p-4 border-b ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h1 className={`text-lg md:text-xl font-bold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Mesaje
              </h1>
              <button
                onClick={() => router.push('/dashboard')}
                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
                title="Închide"
              >
                <i className="ri-close-line text-lg md:text-xl"></i>
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Caută conversații..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full px-3 py-2 pl-9 rounded-lg border text-sm ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              />
              <i className={`ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-sm ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}></i>
            </div>
          </div>

          {/* Chats List - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-4"></div>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Se încarcă...
                  </p>
                </div>
              </div>
            ) : filteredChats.length === 0 ? (
              <div className={`p-8 text-center ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                <i className={`ri-message-3-line text-3xl mb-2 ${
                  isDarkMode ? 'text-gray-600' : 'text-gray-400'
                }`}></i>
                <p className="text-sm">
                  {searchQuery ? 'Nu s-au găsit conversații' : 'Nu ai conversații'}
                </p>
              </div>
            ) : (
              <div>
                {filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => handleOpenChat(chat)}
                    className={`p-3 border-b cursor-pointer transition-colors ${
                      isDarkMode 
                        ? 'border-gray-700 hover:bg-gray-700/50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    } ${selectedChat?.id === chat.id ? (isDarkMode ? 'bg-gray-700' : 'bg-gray-50') : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Product Image - Mai mic */}
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200">
                          {chat.product ? (
                            <img
                              src={getProductDisplayImage(chat.product)}
                              alt={chat.product.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${
                              isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                            }`}>
                              <i className={`ri-image-line text-lg ${
                                isDarkMode ? 'text-gray-500' : 'text-gray-400'
                              }`}></i>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Chat Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <div className="flex-1 min-w-0">
                            <h3 className={`text-sm font-semibold truncate ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              {chat.product?.title || 'Produs șters'}
                            </h3>
                            <p className={`text-xs truncate ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              {chat.other_user?.name || 'Utilizator'}
                            </p>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {chat.unread_count && chat.unread_count > 0 && (
                              <span className={`inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full text-[9px] font-bold leading-none ${
                                isDarkMode 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-blue-500 text-white'
                              }`}>
                                {chat.unread_count > 99 ? '99+' : chat.unread_count}
                              </span>
                            )}
                            {chat.last_message && (
                              <span className={`text-[10px] whitespace-nowrap ${
                                isDarkMode ? 'text-gray-500' : 'text-gray-400'
                              }`}>
                                {formatTime(chat.last_message.created_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        {chat.last_message && (
                          <p className={`text-xs truncate ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {chat.last_message.is_system_message ? (
                              <span className="italic">Sistem: {chat.last_message.message_text}</span>
                            ) : (
                              chat.last_message.message_text
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          {/* Main Chat Area */}
          <div className={`flex-1 flex flex-col ${selectedChat ? 'flex' : 'hidden md:flex'}`}>
            {selectedChat && currentUserId ? (
              <>
                {/* Mobile Header cu buton înapoi */}
                <div className={`md:hidden flex items-center gap-3 p-3 border-b ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <button
                    onClick={handleCloseChat}
                    className={`p-2 rounded-lg transition-colors ${
                      isDarkMode
                        ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
                        : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                    }`}
                    title="Înapoi la lista de conversații"
                  >
                    <i className="ri-arrow-left-line text-xl"></i>
                  </button>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedChat.other_user?.avatar ? (
                      <img
                        src={selectedChat.other_user.avatar}
                        alt={selectedChat.other_user.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <i className={`ri-user-line text-lg ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}></i>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className={`font-semibold truncate text-sm ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {selectedChat.other_user?.name || 'Utilizator'}
                      </h2>
                      <p className={`text-xs truncate ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {selectedChat.product?.title || 'Produs șters'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ProductChat
                    productId={selectedChat.product_id}
                    buyerId={selectedChat.buyer_user_id}
                    sellerId={selectedChat.seller_user_id}
                    currentUserId={currentUserId}
                    isDarkMode={isDarkMode}
                    onClose={handleCloseChat}
                    otherUserInfo={{
                      name: selectedChat.other_user?.name || 'Utilizator',
                      avatar: selectedChat.other_user?.avatar,
                    }}
                  />
                </div>
              </>
            ) : (
              <div className={`flex-1 flex items-center justify-center ${
                isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
              }`}>
                <div className="text-center px-4">
                  <i className={`ri-message-3-line text-4xl md:text-5xl mb-4 ${
                    isDarkMode ? 'text-gray-600' : 'text-gray-400'
                  }`}></i>
                  <h3 className={`text-base md:text-lg font-semibold mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Selectează o conversație
                  </h3>
                  <p className={`text-xs md:text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Alege o conversație din lista din stânga pentru a începe să trimiți mesaje
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

