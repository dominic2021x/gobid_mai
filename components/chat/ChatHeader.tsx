/**
 * ChatHeader.tsx
 * Header-ul chat-ului cu avatar AI, titlu, status și butoane de control
 */

"use client";

import { XMarkIcon } from '@heroicons/react/24/solid';

interface ChatHeaderProps {
  isMinimized: boolean;
  isSpeaking?: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export default function ChatHeader({
  isMinimized,
  isSpeaking = false,
  onMinimize,
  onMaximize,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Avatar AI cu animație */}
        <div
          className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-[#25D366] to-[#075E54] flex items-center justify-center ${
            isSpeaking ? 'animate-pulse' : ''
          }`}
        >
          <span className="text-xl">🤖</span>
        </div>
        
        {/* Titlu și status */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm truncate">
            Asistent Virtual
          </h3>
          <p className="text-xs text-[#B2F5EA] truncate">
            {isSpeaking ? 'vorbește...' : 'online'}
          </p>
        </div>
      </div>

      {/* Butoane de control */}
      <div className="flex items-center gap-2">
        {isMinimized ? (
          <button
            onClick={onMaximize}
            className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
            aria-label="Maximizează chat"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        ) : (
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
            aria-label="Minimizează chat"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}
        
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
          aria-label="Închide chat"
        >
          <XMarkIcon className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}

