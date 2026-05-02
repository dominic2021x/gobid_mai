/**
 * ChatSidebar.tsx
 * Sidebar cu listă conversații clienți
 * Design inspirat din WhatsApp Desktop - dark theme
 */

"use client";

import { useState, useEffect } from 'react';
import type { Conversation } from './AdminChatLayout';
import { getAllConversations, markConversationAsRead } from '@/lib/chat-storage';

interface ChatSidebarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedConversationId: string | null;
  onConversationSelect: (conversationId: string) => void;
}

export default function ChatSidebar({
  searchQuery,
  onSearchChange,
  selectedConversationId,
  onConversationSelect,
}: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load conversations din storage (localStorage)
  useEffect(() => {
    const loadConversations = () => {
      try {
        console.log('[ChatSidebar] Loading conversations...');
        
        // Nu seta isLoading dacă avem deja conversații (pentru refresh silențios)
        if (conversations.length === 0) {
          setIsLoading(true);
        }
        
        // Încarcă conversațiile reale din storage
        const allConversations = getAllConversations();
        console.log('[ChatSidebar] Found conversations:', allConversations.length);
        console.log('[ChatSidebar] Conversations:', allConversations);
        
        // Convertește la formatul așteptat de component
        const formattedConversations: Conversation[] = allConversations.map((conv) => ({
          id: conv.id,
          userId: conv.userId || 'anonymous',
          userName: conv.userName || 'Utilizator',
          userAvatar: conv.userAvatar,
          lastMessage: conv.lastMessage || 'Fără mesaje',
          lastMessageTime: new Date(conv.lastMessageTime),
          unreadCount: conv.unreadCount || 0,
          isOnline: conv.isOnline || false,
          department: conv.department,
        }));

        console.log('[ChatSidebar] Formatted conversations:', formattedConversations.length);
        setConversations(formattedConversations);
        setError(null);
      } catch (err: any) {
        console.error('[ChatSidebar] Error loading conversations:', err);
        setError(err.message || 'Eroare la încărcarea conversațiilor');
      } finally {
        setIsLoading(false);
      }
    };

    // Load initial conversations
    loadConversations();

    // Refresh conversations every 2 seconds pentru sincronizare rapidă
    const interval = setInterval(loadConversations, 2000);
    
    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      console.log('[ChatSidebar] Storage event:', e.key);
      if (e.key?.startsWith('chat_conversations') || e.key?.startsWith('chat_messages_')) {
        console.log('[ChatSidebar] Reloading conversations due to storage change');
        loadConversations();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom storage events (same-tab updates)
    const handleCustomStorage = () => {
      console.log('[ChatSidebar] Custom storage event received, reloading conversations');
      loadConversations();
    };
    
    // Listen for custom events dispatched when messages are saved
    window.addEventListener('chat-storage-updated', handleCustomStorage);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('chat-storage-updated', handleCustomStorage);
    };
  }, [conversations.length]);

  // Marchează conversația ca citită când e selectată
  useEffect(() => {
    if (selectedConversationId) {
      markConversationAsRead(selectedConversationId);
      // Reîncarcă conversațiile pentru a actualiza unreadCount
      const allConversations = getAllConversations();
      const formattedConversations: Conversation[] = allConversations.map((conv) => ({
        id: conv.id,
        userId: conv.userId || 'anonymous',
        userName: conv.userName || 'Utilizator',
        userAvatar: conv.userAvatar,
        lastMessage: conv.lastMessage || 'Fără mesaje',
        lastMessageTime: new Date(conv.lastMessageTime),
        unreadCount: conv.unreadCount || 0,
        isOnline: conv.isOnline || false,
        department: conv.department,
      }));
      setConversations(formattedConversations);
    }
  }, [selectedConversationId]);

  // Filter conversations by search query
  const filteredConversations = conversations.filter((conv) =>
    conv.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Acum';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}z`;
    
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="w-1/3 border-r border-[#2F3A43] flex flex-col bg-[#202C33]">
      {/* Header */}
      <div className="bg-[#111B21] px-4 py-3 border-b border-[#2F3A43]">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Caută conversații..."
            className="flex-1 bg-[#202C33] text-gray-100 px-3 py-2 rounded-lg border border-[#2F3A43] focus:outline-none focus:border-[#00A884] text-sm placeholder-gray-500"
          />
        </div>
        
        {/* Debug Button */}
        <button
          onClick={() => {
            console.log('[DEBUG] Manual refresh clicked');
            const all = getAllConversations();
            console.log('[DEBUG] Conversations in storage:', all);
            console.log('[DEBUG] localStorage keys:', Object.keys(localStorage).filter(k => k.startsWith('chat_')));
            // Reload conversations
            const formattedConversations: Conversation[] = all.map((conv) => ({
              id: conv.id,
              userId: conv.userId || 'anonymous',
              userName: conv.userName || 'Utilizator',
              userAvatar: conv.userAvatar,
              lastMessage: conv.lastMessage || 'Fără mesaje',
              lastMessageTime: new Date(conv.lastMessageTime),
              unreadCount: conv.unreadCount || 0,
              isOnline: conv.isOnline || false,
              department: conv.department,
            }));
            setConversations(formattedConversations);
          }}
          className="w-full px-3 py-1.5 bg-[#00A884] hover:bg-[#06CF9C] text-white text-xs rounded-lg mb-2"
        >
          🔄 Refresh (Debug)
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-400 text-xs">Se încarcă...</p>
            </div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-gray-400 text-sm mb-2">
              {conversations.length === 0 
                ? 'Nu există conversații încă' 
                : 'Nu s-au găsit conversații'}
            </p>
            {conversations.length === 0 && (
              <p className="text-gray-500 text-xs">
                Trimite un mesaj din widget-ul de chat pentru a crea o conversație.
              </p>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onConversationSelect(conv.id)}
              className={`w-full px-4 py-3 hover:bg-[#2A3942] transition-colors border-b border-[#2F3A43] ${
                selectedConversationId === conv.id ? 'bg-[#2A3942]' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {conv.userAvatar ? (
                    <img
                      src={conv.userAvatar}
                      alt={conv.userName}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        // Fallback to initials if image fails
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.avatar-fallback')) {
                          const fallback = document.createElement('div');
                          fallback.className = 'avatar-fallback w-12 h-12 rounded-full bg-[#00A884] flex items-center justify-center text-white font-semibold text-lg';
                          fallback.textContent = conv.userName.charAt(0).toUpperCase();
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#00A884] flex items-center justify-center text-white font-semibold text-lg">
                      {conv.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Online Status */}
                  {conv.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-[#202C33] rounded-full"></div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-gray-100 text-sm truncate">
                      {conv.userName}
                    </h3>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatTime(conv.lastMessageTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-400 truncate">
                      {conv.lastMessage}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-[#00A884] text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  {conv.department && (
                    <span className="inline-block mt-1 text-xs text-gray-500">
                      {conv.department}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/20 text-red-400 text-xs border-t border-red-900/30">
          {error}
        </div>
      )}
    </div>
  );
}
