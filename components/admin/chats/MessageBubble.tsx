/**
 * MessageBubble.tsx
 * Component pentru bulele de mesaj individuale
 * Admin → verde, Client → gri
 */

"use client";

import type { Message } from './ChatWindow';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isAdmin = message.role === 'admin';
  const isSystem = message.role === 'system';

  const formatTime = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-[#2A3942] text-gray-400 text-xs px-3 py-1 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-end gap-2 ${
        isAdmin ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Message Bubble */}
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
          isAdmin
            ? 'bg-[#005C4B] text-white rounded-br-none'
            : 'bg-[#2A3942] text-gray-100 rounded-bl-none'
        }`}
      >
        {/* Message Content */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {/* Timestamp and Status */}
        <div
          className={`flex items-center gap-1 mt-1 ${
            isAdmin ? 'justify-end' : 'justify-start'
          }`}
        >
          <span className="text-[10px] opacity-70">
            {formatTime(message.timestamp)}
          </span>
          
          {/* Seen Status (only for admin messages) */}
          {isAdmin && (
            <svg
              className={`w-3 h-3 ${
                message.seen ? 'text-blue-400' : 'opacity-50'
              }`}
              fill="currentColor"
              viewBox="0 0 16 15"
            >
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

