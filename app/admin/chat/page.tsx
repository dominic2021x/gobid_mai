/**
 * Admin WhatsApp Chat Panel - Clonă 1:1 WhatsApp Web
 * 
 * Features:
 * - Design identic cu WhatsApp Web real
 * - Lista utilizatorilor în stânga (panoul stâng)
 * - Conversație activă în dreapta (panoul drept)
 * - Sincronizare cu WhatsApp Business API
 * - Mesaje în timp real
 */

"use client";

import { useState, useEffect, useRef } from 'react';
import { 
  PhoneIcon, 
  VideoCameraIcon,
  PaperAirplaneIcon,
  EllipsisVerticalIcon,
  PaperClipIcon,
  FaceSmileIcon,
  MicrophoneIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/solid';

interface Message {
  id: string;
  from: string; // Phone number sau 'admin'
  content: string;
  timestamp: Date | string;
  status?: 'sent' | 'delivered' | 'read';
  type?: 'text' | 'image' | 'document' | 'voice';
  isAdmin?: boolean;
}

interface Conversation {
  id: string;
  phoneNumber: string;
  name?: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: Date | string;
  unreadCount?: number;
  isPinned?: boolean;
  status?: 'online' | 'typing' | 'last seen';
  lastSeen?: string;
}

export default function AdminWhatsAppChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversations from WhatsApp Business API
  useEffect(() => {
    loadConversations();
    
    // Poll pentru noi mesaje (în producție folosește webhook)
    const interval = setInterval(() => {
      if (selectedConversation) {
        loadMessages(selectedConversation.phoneNumber);
      }
      loadConversations();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [selectedConversation]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversations list
  const loadConversations = async () => {
    try {
      const response = await fetch('/api/admin/whatsapp/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  // Load messages for a conversation
  const loadMessages = async (phoneNumber: string) => {
    try {
      const response = await fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(phoneNumber)}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Handle conversation selection
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setMessages([]);
    loadMessages(conv.phoneNumber);
    // Mark as read
    markAsRead(conv.phoneNumber);
  };

  // Send message
  const sendMessage = async () => {
    if (!selectedConversation || !input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput('');
    setIsLoading(true);

    // Optimistically add message
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      from: 'admin',
      content: messageText,
      timestamp: new Date(),
      status: 'sent',
      isAdmin: true,
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const response = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.phoneNumber,
          message: messageText,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update message with real ID and status
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id 
            ? { ...msg, id: data.messageId, status: 'delivered' }
            : msg
        ));
        // Reload messages to get read status
        setTimeout(() => loadMessages(selectedConversation.phoneNumber), 2000);
      } else {
        // Remove failed message
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  // Mark conversation as read
  const markAsRead = async (phoneNumber: string) => {
    try {
      await fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(phoneNumber)}/read`, {
        method: 'POST',
      });
      // Update local state
      setConversations(prev => prev.map(conv =>
        conv.phoneNumber === phoneNumber ? { ...conv, unreadCount: 0 } : conv
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.name?.toLowerCase().includes(query) ||
      conv.phoneNumber.includes(query) ||
      conv.lastMessage?.toLowerCase().includes(query)
    );
  });

  // Format time
  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format date for conversation list
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return formatTime(d);
    if (days === 1) return 'Ieri';
    if (days < 7) return d.toLocaleDateString('ro-RO', { weekday: 'short' });
    return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-[#f0f2f5]">
      {/* Left Panel - Conversations List - WhatsApp Style */}
      <div className="w-[30%] bg-white flex flex-col border-r border-[#e4e6eb]">
        {/* Header */}
        <div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#dfe5e7] cursor-pointer hover:bg-[#d1d7db] transition-colors flex items-center justify-center">
              <img 
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face" 
                alt="Profile" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
            <h1 className="text-lg font-semibold text-[#41525d]">Chats</h1>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-[#e4e6eb] rounded-full transition-colors">
              <svg className="w-6 h-6 text-[#54656f]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2-4.6-4.6s2-4.6 4.6-4.6 4.6 2 4.6 4.6-2 4.6-4.6 4.6z"/>
              </svg>
            </button>
            <button className="p-2 hover:bg-[#e4e6eb] rounded-full transition-colors">
              <EllipsisVerticalIcon className="w-6 h-6 text-[#54656f]" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 bg-white">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#667781]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full pl-10 pr-4 py-2 bg-[#f0f2f5] text-[#667781] rounded-lg focus:outline-none focus:ring-0 focus:bg-white focus:shadow-sm placeholder-[#667781] text-sm"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-[#667781]">
              Nu există conversații
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`w-full px-4 py-3 hover:bg-[#f5f6f6] transition-colors text-left border-b border-[#e4e6eb] ${
                  selectedConversation?.phoneNumber === conv.phoneNumber ? 'bg-[#f0f2f5]' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0 relative">
                    {conv.avatar ? (
                      <img src={conv.avatar} alt={conv.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-white text-lg font-semibold">
                        {conv.name?.charAt(0).toUpperCase() || conv.phoneNumber.slice(-1)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-[#111b21] text-sm truncate">
                        {conv.name || conv.phoneNumber}
                      </h3>
                      <span className="text-xs text-[#667781] ml-2 flex-shrink-0">
                        {formatDate(conv.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[#667781] truncate">
                        {conv.lastMessage || 'Fără mesaje'}
                      </p>
                      {conv.unreadCount && conv.unreadCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 bg-[#25D366] text-white text-xs rounded-full flex-shrink-0 min-w-[20px] justify-center font-medium">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Active Conversation - WhatsApp Style */}
      <div className="flex-1 flex flex-col bg-[#efeae2]">
        {selectedConversation ? (
          <>
            {/* Header - WhatsApp Green */}
            <div className="bg-[#008069] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                  {selectedConversation.avatar ? (
                    <img src={selectedConversation.avatar} alt={selectedConversation.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-[#008069] font-semibold text-lg">
                      {selectedConversation.name?.charAt(0).toUpperCase() || selectedConversation.phoneNumber.slice(-1)}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-white font-medium text-base">
                    {selectedConversation.name || selectedConversation.phoneNumber}
                  </h2>
                  <p className="text-xs text-[#a7c5d2]">
                    {selectedConversation.status === 'online' 
                      ? 'online' 
                      : selectedConversation.lastSeen 
                        ? `last seen ${selectedConversation.lastSeen}`
                        : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-[#006c57] rounded-full transition-colors">
                  <VideoCameraIcon className="w-6 h-6 text-white" />
                </button>
                <button className="p-2 hover:bg-[#006c57] rounded-full transition-colors">
                  <PhoneIcon className="w-6 h-6 text-white" />
                </button>
                <button className="p-2 hover:bg-[#006c57] rounded-full transition-colors">
                  <MagnifyingGlassIcon className="w-6 h-6 text-white" />
                </button>
                <button className="p-2 hover:bg-[#006c57] rounded-full transition-colors">
                  <EllipsisVerticalIcon className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Messages Area - WhatsApp Background Pattern */}
            <div
              className="flex-1 overflow-y-auto px-4 py-2 relative"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5ddd5' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23e5ddd5'/%3E%3Crect width='100' height='100' fill='url(%23grid)' /%3E%3C/svg%3E")`,
                backgroundColor: '#efeae2',
              }}
            >
              <div className="space-y-1">
                {messages.map((msg) => {
                  const isAdmin = msg.from === 'admin' || msg.isAdmin;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} items-end gap-1 mb-0.5`}
                    >
                      {!isAdmin && (
                        <div className="w-8 h-8 rounded-full bg-[#dfe5e7] flex items-center justify-center flex-shrink-0 mb-1">
                          <span className="text-[#54656f] text-xs font-semibold">
                            {selectedConversation.name?.charAt(0).toUpperCase() || selectedConversation.phoneNumber.slice(-1)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`max-w-[65%] rounded-lg px-2 py-1.5 shadow-sm ${
                          isAdmin
                            ? 'bg-[#dcf8c6] text-[#30383d] rounded-br-none'
                            : 'bg-white text-[#30383d] rounded-bl-none'
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words select-text">
                          {msg.content}
                        </p>
                        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isAdmin ? 'text-[#667781]' : 'text-[#667781]'}`}>
                          <span className="text-[11px] leading-none">
                            {formatTime(msg.timestamp)}
                          </span>
                          {isAdmin && (
                            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 16 15">
                              {msg.status === 'read' ? (
                                <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z"/>
                              ) : msg.status === 'delivered' ? (
                                <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z"/>
                              ) : (
                                <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.036a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm-1.138-1.138L13.713.424l-4.338 2.761L5.498 8.932Z"/>
                              )}
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area - WhatsApp Style */}
            <div className="bg-[#f0f2f5] px-4 py-2 flex items-center gap-2">
              <button className="p-2 hover:bg-[#e4e6eb] rounded-full transition-colors">
                <FaceSmileIcon className="w-6 h-6 text-[#54656f]" />
              </button>
              <button className="p-2 hover:bg-[#e4e6eb] rounded-full transition-colors">
                <PaperClipIcon className="w-6 h-6 text-[#54656f]" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message"
                className="flex-1 px-4 py-2 bg-white text-[#111b21] rounded-lg focus:outline-none focus:ring-0 placeholder-[#667781] text-sm"
                disabled={isLoading}
              />
              {input.trim() ? (
                <button
                  onClick={sendMessage}
                  disabled={isLoading}
                  className="p-2 bg-[#008069] hover:bg-[#006c57] rounded-full transition-colors disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="w-6 h-6 text-white rotate-45" />
                </button>
              ) : (
                <button className="p-2 hover:bg-[#e4e6eb] rounded-full transition-colors">
                  <MicrophoneIcon className="w-6 h-6 text-[#54656f]" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#efeae2]">
            <div className="text-center">
              <div className="w-40 h-40 mx-auto mb-4 opacity-20">
                <svg viewBox="0 0 175.216 175.552" className="w-full h-full">
                  <defs>
                    <linearGradient id="b" x1="85.915" x2="86.535" y1="32.567" y2="137.092" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#57d163"/>
                      <stop offset="1" stopColor="#23b33a"/>
                    </linearGradient>
                    <filter id="a" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/>
                      <feOffset dy="3"/>
                      <feGaussianBlur stdDeviation="3"/>
                      <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"/>
                      <feBlend in2="BackgroundImageFix" result="effect1_dropShadow"/>
                      <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
                    </filter>
                  </defs>
                  <g filter="url(#a)" transform="translate(9.716 9.71)">
                    <path fill="url(#b)" d="M79.5 129.762c-44.915 0-81.286-36.37-81.286-81.285 0-44.915 36.37-81.286 81.286-81.286s81.286 36.37 81.286 81.286c0 44.915-36.37 81.285-81.286 81.285z" opacity="0.25"/>
                    <path fill="#fff" fillRule="evenodd" d="M155.568 124.076c-1.857-2.002-4.638-2.657-7.14-2.003l-18.013 4.87a4.293 4.293 0 0 1-4.338-1.625l-8.338-14.197a107.157 107.157 0 0 1-10.972-5.55c-16.951-10.492-30.631-27.87-35.98-48.774a78.97 78.97 0 0 1-1.997-20.895c0-24.82 20.19-45.01 45.01-45.01 24.82 0 45.01 20.19 45.01 45.01 0 7.343-1.77 14.55-5.146 20.948-1.857 3.504-5.422 5.85-9.36 6.41l-10.894 1.558a4.293 4.293 0 0 0-3.606 4.79l1.245 10.003c.359 2.89-.767 5.75-2.882 7.635zm-24.57-21.618l7.515 12.795 14.234-3.846 7.682-1.098-1.02-8.204a2.155 2.155 0 0 1 1.813-2.406l9.036-1.292c2.642-.378 4.604-2.705 5.165-5.313 2.86-5.398 4.355-11.398 4.355-17.526 0-19.977-16.25-36.227-36.227-36.227-19.977 0-36.227 16.25-36.227 36.227 0 6.36 1.647 12.632 4.768 18.165 4.68 17.214 16.195 31.675 30.774 40.71a95.22 95.22 0 0 0 9.65 4.89z"/>
                    <path fill="#fff" fillRule="evenodd" d="M91.01 47.926c0-2.58-2.092-4.672-4.672-4.672H52.894c-2.58 0-4.672 2.092-4.672 4.672s2.092 4.672 4.672 4.672h33.444c2.58 0 4.672-2.092 4.672-4.672zm-24.786 19.345c0-2.58-2.092-4.672-4.672-4.672H52.894c-2.58 0-4.672 2.092-4.672 4.672s2.092 4.672 4.672 4.672h8.658c2.58 0 4.672-2.092 4.672-4.672z"/>
                  </g>
                </svg>
              </div>
              <p className="text-[#667781] text-lg">Selectați o conversație pentru a începe</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
