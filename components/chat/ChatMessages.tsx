/**
 * ChatMessages.tsx
 * Listă de mesaje cu bule rotunjite, stil WhatsApp
 * Diferențiere vizuală între mesajele utilizatorului și ale AI-ului
 */

"use client";

import { PhoneIcon } from '@heroicons/react/24/solid';
import Image from "next/image";
import type { Message } from './ChatWidget';

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onWhatsAppFallback: () => void;
}

export default function ChatMessages({
  messages,
  isLoading,
  messagesEndRef,
  onWhatsAppFallback,
}: ChatMessagesProps) {
  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-4 space-y-1 relative"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5ddd5' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23e5ddd5'/%3E%3Crect width='100' height='100' fill='url(%23grid)' /%3E%3C/svg%3E")`,
        backgroundColor: '#e5ddd5',
      }}
    >
      <div className="relative z-10">
        {messages.map((msg) => (
                         <div
                 key={msg.id}
                 className={`flex ${
                   msg.role === 'user' ? 'justify-end' : 'justify-start'
                 } items-end gap-1.5 mb-1 w-full`}
                 style={{ flexDirection: 'row', flexWrap: 'nowrap', width: '100%' }}
               >
                 {/* Avatar AI sau Admin (înainte de mesaj) */}
                 {(msg.role === 'assistant' || msg.role === 'admin') && (
                   msg.role === 'assistant' ? (
                     <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-[#25D366] to-[#075E54] flex items-center justify-center">
                       <span className="text-xs">🤖</span>
                     </div>
                   ) : (
                     <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                       <span className="text-xs">👤</span>
                     </div>
                   )
                 )}
                                                              {/* Bula de mesaj */}
                 <div
                   className={`rounded-lg px-2 py-1.5 shadow-sm ${
                     msg.role === 'user'
                       ? 'bg-[#dcf8c6] text-gray-900 rounded-br-none'
                       : msg.role === 'admin'
                       ? 'bg-blue-100 text-gray-900 rounded-bl-none border border-blue-300'
                       : 'bg-white text-gray-900 rounded-bl-none'
                   }`}
              style={{
                maxWidth: '75%',
                minWidth: '0',
                display: 'flex',
                flexDirection: 'column',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {/* Conținut mesaj */}
              <div
                className="text-sm leading-relaxed"
                style={{
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  display: 'block',
                  writingMode: 'horizontal-tb',
                  direction: 'ltr',
                  margin: 0,
                  padding: 0,
                  lineHeight: '1.4',
                }}
              >
                {String(msg.content)
                  .replace(/[\r\n\v\f]+/g, ' ')
                  .replace(/[\u200B-\u200D\uFEFF]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()}
              </div>

              {/* Buton fallback WhatsApp */}
              {msg.fallbackSuggested && msg.role === 'assistant' && (
                <button
                  onClick={onWhatsAppFallback}
                  className="mt-2 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BA5A] text-white text-xs rounded-lg flex items-center gap-2 transition-colors"
                >
                  <PhoneIcon className="w-4 h-4" />
                  Contactează prin WhatsApp
                </button>
              )}

              {/* Timestamp și icon de citire */}
              <div
                className={`flex items-center justify-end gap-1 mt-0.5 ${
                  msg.role === 'user' ? 'text-[#667781]' : 'text-[#667781]'
                }`}
              >
                <span className="text-[10px] leading-none">
                  {new Date(msg.timestamp).toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {msg.role === 'user' && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 15">
                    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
                  </svg>
                )}
              </div>
            </div>

                            {/* Avatar utilizator */}
                {msg.role === 'user' && (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                    {(() => {
                      // Încearcă să obțină avatarul din localStorage
                      try {
                        const userInfo = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('userInfo') || '{}') : {};
                        if (userInfo.avatar) {
                          return (
                            <Image 
                              src={userInfo.avatar} 
                              alt="Avatar" 
                              fill
                              sizes="32px"
                              className="object-cover rounded-full"
                            />
                          );
                        }
                        const initials = `${userInfo.firstName?.[0] || 'U'}${userInfo.lastName?.[0] || ''}`;
                        return <span className="text-xs font-semibold text-gray-600">{initials}</span>;
                      } catch {
                        return <span className="text-xs font-semibold text-gray-600">U</span>;
                      }
                    })()}
                  </div>
                )}
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start items-end gap-1.5 mb-1">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
              <span className="text-xs">🤖</span>
            </div>
            <div className="bg-white px-3 py-2 rounded-lg rounded-bl-none shadow-sm">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
