/**
 * ChatWindow.tsx
 * Fereastra de chat activă - header + mesaje + input bar
 * Design inspirat din WhatsApp Desktop
 */

"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import MessageBubble from './MessageBubble';
import { getMessages, getConversation, saveMessage, markConversationAsRead, updateConversation } from '@/lib/chat-storage';
import type { ChatMessage } from '@/lib/chat-storage';

const InputBarDynamic = dynamic(() => import('./InputBar'), {
  ssr: false,
});

export interface Message {
  id: string;
  role: 'user' | 'admin' | 'system';
  content: string;
  timestamp: Date | string;
  seen: boolean;
  isTyping?: boolean;
}

interface ChatWindowProps {
  conversationId: string;
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationInfo, setConversationInfo] = useState<{
    userName: string;
    userAvatar?: string;
    isOnline: boolean;
    department?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);

  // Load conversation info and messages din storage
  useEffect(() => {
    const loadConversation = () => {
      try {
        // Nu seta isLoading dacă avem deja mesaje (pentru refresh live)
        if (messages.length === 0) {
          setIsLoading(true);
        }
        
        if (!conversationId) {
          setIsLoading(false);
          return;
        }

        // Load conversation info din storage
        const conversation = getConversation(conversationId);
        if (conversation) {
          setConversationInfo({
            userName: conversation.userName || 'Utilizator',
            userAvatar: conversation.userAvatar,
            isOnline: conversation.isOnline || false,
            department: conversation.department,
          });
        }

        // Load messages din storage
        const chatMessages = getMessages(conversationId);
        console.log('[ChatWindow] Loaded messages:', chatMessages.length);
        
        // Convertește la formatul așteptat de component
        const formattedMessages: Message[] = chatMessages.map((msg: ChatMessage) => ({
          id: msg.id,
          role: msg.role === 'admin' ? 'admin' : msg.role === 'assistant' ? 'system' : 'user',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          seen: msg.read || false,
        }));

        // Actualizează doar dacă există diferențe (pentru a evita re-render-uri inutile)
        const hasNewMessages = formattedMessages.length !== messages.length || 
          formattedMessages.some((msg, idx) => 
            !messages[idx] || messages[idx].id !== msg.id || messages[idx].content !== msg.content
          );
        
        if (hasNewMessages) {
          console.log('[ChatWindow] Updating messages - new message detected');
          setMessages(formattedMessages);
          // Auto-scroll la ultimul mesaj
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }

        // Marchează conversația ca citită
        markConversationAsRead(conversationId);
      } catch (err: any) {
        console.error('[ChatWindow] Error loading conversation:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (conversationId) {
      loadConversation();
    }

    // Listen for storage changes (live sync)
    const handleStorageUpdate = () => {
      if (conversationId) {
        loadConversation();
      }
    };
    
    window.addEventListener('chat-storage-updated', handleStorageUpdate);
    
    // Poll for new messages every 500ms pentru sincronizare live
    const interval = setInterval(() => {
      if (conversationId) {
        loadConversation();
      }
    }, 500);

    // Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (conversationId && (e.key?.includes(conversationId) || e.key?.startsWith('chat_conversations'))) {
        loadConversation();
      }
    };

    const handleCustomStorage = () => {
      if (conversationId) {
        const chatMessages = getMessages(conversationId);
        const formattedMessages: Message[] = chatMessages.map((msg: ChatMessage) => ({
          id: msg.id,
          role: msg.role === 'admin' ? 'admin' : msg.role === 'assistant' ? 'system' : 'user',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          seen: msg.read || false,
        }));
        setMessages(formattedMessages);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('chat-storage-updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [conversationId, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Send message
  const handleSendMessage = async (content: string, isVoice?: boolean) => {
    if (!content.trim() || isSending || !conversationId) return;

    setIsSending(true);

    try {
      // Obține info conversație pentru userId
      const conversation = getConversation(conversationId);
      
      // Creează mesajul admin-ului
      const adminMessage: ChatMessage = {
        id: `msg-admin-${Date.now()}`,
        role: 'admin',
        content: content.trim(),
        timestamp: new Date().toISOString(),
        conversationId: conversationId,
        userId: conversation?.userId,
        department: conversation?.department,
        read: false,
      };

      // Salvează mesajul în storage
      saveMessage(adminMessage);

      // Adaugă mesajul în lista locală
      const newMessage: Message = {
        id: adminMessage.id,
        role: 'admin',
        content: adminMessage.content,
        timestamp: new Date(adminMessage.timestamp),
        seen: false,
      };

      setMessages(prev => [...prev, newMessage]);

      // Scroll la ultimul mesaj
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Simulează delay pentru UI
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('Eroare la trimiterea mesajului. Te rog încearcă din nou.');
    } finally {
      setIsSending(false);
    }
  };

  // AI suggest response
  const handleAISuggest = async () => {
    try {
      setIsTyping(true);
      
      // Get last user message
      const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
      
      if (!lastUserMessage) {
        setIsTyping(false);
        return;
      }

      const response = await fetch('/api/admin/ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          userMessage: lastUserMessage.content,
          conversationHistory: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggestion) {
          // Auto-fill input bar with suggestion (we'll need to pass this via callback)
          console.log('AI Suggestion:', data.suggestion);
        }
      }
    } catch (err) {
      console.error('Error getting AI suggestion:', err);
    } finally {
      setIsTyping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121B22]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00A884] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Se încarcă conversația...</p>
        </div>
      </div>
    );
  }

  if (!conversationInfo) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121B22]">
        <p className="text-gray-400 text-sm">Conversație negăsită</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#121B22]">
      {/* Header */}
      <div className="bg-[#202C33] px-4 py-3 border-b border-[#2F3A43] flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {conversationInfo.userAvatar ? (
              <img
                src={conversationInfo.userAvatar}
                alt={conversationInfo.userName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#00A884] flex items-center justify-center text-white font-semibold">
                {conversationInfo.userName.charAt(0).toUpperCase()}
              </div>
            )}
            {conversationInfo.isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#202C33] rounded-full"></div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-100 text-sm truncate">
              {conversationInfo.userName}
            </h3>
            <p className="text-xs text-gray-400 truncate">
              {conversationInfo.isOnline ? 'online' : 'offline'}
              {conversationInfo.department && ` • ${conversationInfo.department}`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAISuggest}
            className="p-2 text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942] rounded-full transition-colors"
            title="Sugerează răspuns AI"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </button>
          <button
            className="p-2 text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942] rounded-full transition-colors"
            title="Apel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </button>
          <button
            className="p-2 text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942] rounded-full transition-colors"
            title="Atașament"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <button
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-[#2A3942] rounded-full transition-colors"
            title="Șterge conversație"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2 bg-[#121B22]">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Nu există mesaje încă. Începe conversația!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            
            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#2A3942] px-4 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Bar */}
      <InputBarDynamic
        onSend={handleSendMessage}
        isSending={isSending}
        conversationId={conversationId}
      />
    </div>
  );
}
