"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
  buildProxiedAiChatBody,
  assistantTextFromProxiedResponse,
} from '@/lib/ai/externalChatPayload';
import VoiceSearchEnterprise from './VoiceSearchEnterprise';
import { XMarkIcon, PaperAirplaneIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  selectedModel?: string;
  modelFallbackApplied?: boolean;
}

interface AIChatEnterpriseProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export default function AIChatEnterprise({
  isOpen,
  onClose,
  isDarkMode = true,
}: AIChatEnterpriseProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speak = (text: string) => {
    if (!voiceEnabled || !synthRef.current) return;

    // Anulează orice vorbire anterioară
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    utterance.volume = 0.8;

    // Încearcă să găsească voce română
    const voices = synthRef.current.getVoices();
    const romanianVoice = voices.find(voice => 
      voice.lang.includes('ro') || voice.lang.includes('RO')
    );
    
    if (romanianVoice) {
      utterance.voice = romanianVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    // Adaugă mesajul utilizatorului
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Construiește istoricul conversației
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildProxiedAiChatBody({
            userMessage: messageText,
            conversationHistory,
          })
        ),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const reply = assistantTextFromProxiedResponse(data);
      const fromMeta =
        typeof data?.selectedModel === 'string' ? data.selectedModel.trim() : '';
      const fromModel =
        typeof (data as { model?: string })?.model === 'string'
          ? (data as { model: string }).model.trim()
          : '';
      const selectedModel = (fromMeta || fromModel) || undefined;
      const modelFallbackApplied =
        typeof data?.modelFallbackApplied === 'boolean' ? data.modelFallbackApplied : undefined;

      if (data && typeof data === 'object' && 'conversationId' in data) {
        const cid = (data as { conversationId?: string }).conversationId;
        if (typeof cid === 'string') setConversationId(cid);
      }

      const aiMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        ...(selectedModel ? { selectedModel, modelFallbackApplied } : {}),
      };

      setMessages(prev => [...prev, aiMessage]);

      if (voiceEnabled && reply) {
        speak(reply);
      }

      if (
        data &&
        typeof data === 'object' &&
        (data as { shouldSwitchToSearch?: boolean }).shouldSwitchToSearch
      ) {
        // Poți adăuga logică pentru a deschide automat rezultatele căutării
        console.log('Should switch to search mode');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: 'Îmi pare rău, am întâmpinat o eroare. Te rog încearcă din nou.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setInput(text);
    // Auto-send după transcriere vocală
    setTimeout(() => sendMessage(text), 300);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Chat Container - Glassmorphism */}
      <div
        className={`
          relative w-full max-w-2xl h-[80vh] max-h-[700px] mx-4
          rounded-2xl shadow-2xl
          ${isDarkMode ? 'bg-gray-900/95' : 'bg-white/95'}
          backdrop-blur-xl border
          ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}
          flex flex-col pointer-events-auto
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`
            flex items-center justify-between p-4 border-b
            ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}
          `}
        >
          <div className="flex items-center space-x-3">
            {/* Avatar animat */}
            <div className="relative">
              <div
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  ${isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-blue-600'}
                  transition-all duration-300
                `}
              >
                <span className="text-2xl">🤖</span>
              </div>
              {/* Animation ring when speaking */}
              {isSpeaking && (
                <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-75"></span>
              )}
            </div>
            <div>
              <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Asistent AI
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {isSpeaking ? 'Vorbește...' : 'Gata să răspundă'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Voice toggle */}
            <button
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (isSpeaking) stopSpeaking();
              }}
              className={`
                p-2 rounded-lg transition-colors
                ${voiceEnabled
                  ? isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'
                  : isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400'
                }
              `}
              title={voiceEnabled ? 'Dezactivează vocea' : 'Activează vocea'}
            >
              {voiceEnabled ? (
                <SpeakerWaveIcon className="w-5 h-5" />
              ) : (
                <SpeakerXMarkIcon className="w-5 h-5" />
              )}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}
              `}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <p className="text-lg mb-2">👋 Salut! Cu ce te pot ajuta?</p>
              <p className="text-sm">Poți vorbi sau scrie aici.</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[80%] rounded-2xl px-4 py-2
                  ${
                    message.role === 'user'
                      ? isDarkMode
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-900'
                      : isDarkMode
                      ? 'bg-gray-800 text-gray-100'
                      : 'bg-gray-100 text-gray-900'
                  }
                `}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === 'assistant' && message.selectedModel && (
                  <p
                    className={`text-[10px] mt-1 ${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {message.selectedModel}
                    {message.modelFallbackApplied ? ' · gemma fallback' : ''}
                  </p>
                )}
                <p
                  className={`text-xs mt-1 ${
                    message.role === 'user'
                      ? isDarkMode ? 'text-blue-200' : 'text-blue-700'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div
                className={`
                  rounded-2xl px-4 py-2
                  ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}
                `}
              >
                <div className="flex space-x-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          className={`
            p-4 border-t
            ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}
          `}
        >
          <div className="flex items-end space-x-2">
            {/* Voice Search */}
            <VoiceSearchEnterprise
              onTranscript={handleVoiceTranscript}
              onListeningChange={(listening) => {
                // Poți adăuga logică aici
              }}
              disabled={isLoading}
            />

            {/* Text Input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scrie sau vorbește..."
                rows={1}
                className={`
                  w-full px-4 py-3 pr-12 rounded-xl resize-none
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${isDarkMode
                    ? 'bg-gray-800 text-white placeholder-gray-400 border border-gray-700'
                    : 'bg-gray-50 text-gray-900 placeholder-gray-500 border border-gray-200'
                  }
                `}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={`
                p-3 rounded-xl transition-colors
                ${input.trim() && !isLoading
                  ? isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

