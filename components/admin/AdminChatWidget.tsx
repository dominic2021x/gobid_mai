/**
 * AdminChatWidget.tsx
 * Widget flotant pentru chat intern admin - apare în colțul dreapta-jos
 * Se deschide într-un modal cu chat-ul intern între admini/manageri
 */

"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { XMarkIcon } from '@heroicons/react/24/solid';

// Dynamic import pentru AdminInternalChat
const AdminInternalChat = dynamic(
  () => import('./AdminInternalChat'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Se încarcă chat-ul...</p>
        </div>
      </div>
    ),
  }
);

export default function AdminChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  // Floating Button - când e închis
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[99999] w-16 h-16 bg-[#00A884] hover:bg-[#06CF9C] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center"
        aria-label="Deschide chat intern"
        title="Chat Intern"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-7 h-7"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
      </button>
    );
  }

  // Modal cu Chat Intern - când e deschis
  return (
    <div 
      className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div className="relative w-full h-full max-w-[1400px] max-h-[90vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header cu buton închidere */}
        <div className="bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm">💬</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Chat Intern</h3>
              <p className="text-xs text-gray-500">Administratori și Manageri</p>
            </div>
          </div>
          
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Închide chat"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Intern */}
        <div className="flex-1 overflow-hidden">
          <AdminInternalChat />
        </div>
      </div>
    </div>
  );
}
