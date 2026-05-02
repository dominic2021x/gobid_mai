/**
 * AI Chat Component - Interfață de chat cu AI-ul
 * Integrat cu sistemul RAG pentru răspunsuri contextuale
 */

"use client";

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Array<{ text: string; source: string; score: number }>;
}

interface AIChatProps {
  onEscalateToSupport?: (message: string) => void;
  initialMessages?: Message[];
}

export default function AIChat({ onEscalateToSupport, initialMessages = [] }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string>(`conv-${Date.now()}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Încarcă configurația personalizată AI din localStorage
      let aiResponseConfig = null;
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('aiResponseConfig');
          if (saved) {
            aiResponseConfig = JSON.parse(saved);
          }
        } catch (e) {
          console.error('Error loading AI config:', e);
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationId: conversationIdRef.current,
          responseConfig: aiResponseConfig, // Trimite configurația personalizată
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toISOString(),
        sources: data.sources,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Dacă AI sugerează suport uman, notifică parent component
      if (data.needsHumanSupport && onEscalateToSupport) {
        setTimeout(() => {
          onEscalateToSupport(input);
        }, 1000);
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Folosește template personalizat pentru eroare dacă e disponibil
      let errorText = 'Îmi pare rău, am întâmpinat o eroare. Te rog încearcă din nou sau contactează suportul.';
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('aiResponseConfig');
          if (saved) {
            const config = JSON.parse(saved);
            if (config.templates?.noResults) {
              errorText = config.templates.noResults;
            }
          }
        } catch (e) {
          // Ignore
        }
      }
      
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: errorText,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-robot-line text-white text-2xl"></i>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Cristina - Asistent Virtual</h3>
            <p className="text-gray-400">Cum te pot ajuta astăzi?</p>
            <p className="text-gray-500 text-sm mt-2">
              Pot răspunde la întrebări despre licitații, produse și platformă
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm'
                    : 'bg-gray-700 text-white rounded-bl-sm'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/20">
                    <p className="text-xs opacity-70 mb-1">Surse:</p>
                    {message.sources.slice(0, 2).map((source, idx) => (
                      <p key={idx} className="text-xs opacity-60">
                        • {source.source}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-xs opacity-60 mt-2">
                  {new Date(message.timestamp).toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Scrie întrebarea ta..."
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              !input.trim() || isLoading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            <i className="ri-send-plane-line"></i>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Apasă Enter pentru a trimite • Shift+Enter pentru linie nouă
        </p>
      </div>
    </div>
  );
}

