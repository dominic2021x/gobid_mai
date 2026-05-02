/**
 * InputBar.tsx
 * Bară de input pentru mesaje - text, microfon, trimitere
 * Design inspirat din WhatsApp Desktop
 */

"use client";

import { useState, useRef } from 'react';
import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  FaceSmileIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';
import { MicrophoneIcon as MicrophoneIconSolid } from '@heroicons/react/24/solid';

interface InputBarProps {
  onSend: (content: string, isVoice?: boolean) => void;
  isSending: boolean;
  conversationId: string;
}

export default function InputBar({
  onSend,
  isSending,
  conversationId,
}: InputBarProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    
    const messageContent = input.trim();
    setInput('');
    onSend(messageContent, false);
    
    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      // TODO: Implement voice recording and transcription
      // For now, just toggle
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        // TODO: Implement MediaRecorder and send to /api/voice-search
        // Stop stream for now
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Nu s-a putut accesa microfonul. Verificați permisiunile.');
      }
    }
  };

  return (
    <div className="bg-[#202C33] px-4 py-3 border-t border-[#2F3A43]">
      <div className="flex items-center gap-2">
        {/* Emoji Button */}
        <button
          type="button"
          className="p-2 text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942] rounded-full transition-colors"
          title="Emoji"
        >
          <FaceSmileIcon className="w-5 h-5" />
        </button>

        {/* Attachment Button */}
        <button
          type="button"
          className="p-2 text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942] rounded-full transition-colors"
          title="Atașează fișier"
        >
          <PaperClipIcon className="w-5 h-5" />
        </button>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Scrieți un mesaj"
          className="flex-1 px-4 py-2.5 bg-[#2A3942] text-gray-100 rounded-lg border border-[#2F3A43] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent placeholder-gray-500 text-sm"
          disabled={isSending}
        />

        {/* Send Button or Microphone */}
        {input.trim() ? (
          <button
            onClick={handleSend}
            disabled={isSending}
            className="p-2 bg-[#00A884] hover:bg-[#06CF9C] text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            title="Trimite mesaj"
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <PaperAirplaneIcon className="w-5 h-5 rotate-45" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleVoiceRecord}
            className={`p-2 rounded-full transition-colors ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'text-gray-400 hover:text-[#00A884] hover:bg-[#2A3942]'
            }`}
            title="Înregistrare vocală"
          >
            {isRecording ? (
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

