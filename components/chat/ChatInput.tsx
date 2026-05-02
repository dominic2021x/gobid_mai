/**
 * ChatInput.tsx
 * Input bar pentru mesaje text și înregistrare vocală
 * Include microfon animat și buton de trimitere
 */

"use client";

import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  FaceSmileIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';
import { MicrophoneIcon as MicrophoneIconSolid } from '@heroicons/react/24/solid';

interface ChatInputProps {
  input: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isListening: boolean;
  isLoading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: (text?: string) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onMicrophoneClick: () => void;
}

export default function ChatInput({
  input,
  inputRef,
  isListening,
  isLoading,
  onChange,
  onSend,
  onKeyPress,
  onMicrophoneClick,
}: ChatInputProps) {
  return (
    <div className="bg-[#F0F2F5] px-3 py-2 border-t border-gray-200 flex-shrink-0">
      <div className="flex items-center gap-2">
        {/* Buton emoji */}
        <button
          type="button"
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          title="Emoji"
        >
          <FaceSmileIcon className="w-5 h-5" />
        </button>

        {/* Buton attachment */}
        <button
          type="button"
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          title="Attachment"
        >
          <PaperClipIcon className="w-5 h-5" />
        </button>

        {/* Input text */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={onChange}
          onKeyPress={onKeyPress}
          placeholder="Scrieți un mesaj"
          className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
          disabled={isLoading}
        />

        {/* Buton send sau microfon */}
        {input.trim() ? (
          <button
            onClick={() => onSend()}
            disabled={isLoading}
            className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#20BA5A] text-white shadow-sm transition-all flex items-center justify-center hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Trimite mesaj"
          >
            <PaperAirplaneIcon className="w-5 h-5 rotate-45" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMicrophoneClick}
            className={`w-9 h-9 rounded-full ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-[#25D366] hover:bg-[#20BA5A]'
            } text-white shadow-sm transition-all flex items-center justify-center`}
            title="Record voice"
            aria-label="Înregistrare vocală"
          >
            {isListening ? (
              <MicrophoneIconSolid className="w-5 h-5" />
            ) : (
              <MicrophoneIcon className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
