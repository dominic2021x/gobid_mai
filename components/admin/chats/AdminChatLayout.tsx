/**
 * AdminChatLayout.tsx
 * Layout principal pentru chat-ul admin - 2 coloane (sidebar + chat window)
 * Design inspirat din WhatsApp Desktop
 */

"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ChatSidebar from './ChatSidebar';
import ChatWindow from './ChatWindow';

// Dynamic imports pentru optimizare
const ChatSidebarDynamic = dynamic(() => import('./ChatSidebar'), {
  ssr: false,
  loading: () => (
    <div className="w-1/3 bg-[#202C33] animate-pulse">
      <div className="h-full bg-gray-700 opacity-20"></div>
    </div>
  ),
});

const ChatWindowDynamic = dynamic(() => import('./ChatWindow'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[#121B22] animate-pulse">
      <div className="h-full bg-gray-700 opacity-20"></div>
    </div>
  ),
});

export interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  isOnline: boolean;
  department?: string;
}

export default function AdminChatLayout() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex h-full bg-[#121B22] text-gray-100 overflow-hidden">
      {/* Sidebar - Listă conversații */}
      <div className="w-1/3 border-r border-[#2F3A43] flex flex-col">
        <ChatSidebarDynamic
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedConversationId={selectedConversation}
          onConversationSelect={setSelectedConversation}
        />
      </div>

      {/* Chat Window - Conversația activă */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <ChatWindowDynamic conversationId={selectedConversation} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#121B22]">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-[#2F3A43] flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">
                Selectează o conversație
              </h3>
              <p className="text-sm text-gray-500">
                Alege o conversație din listă pentru a începe
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
