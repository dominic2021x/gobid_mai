"use client";

import React, { useState, useRef, useEffect } from 'react';
import VoiceTTS from './VoiceTTS';
import VoiceSearch from './VoiceSearch';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  audioUrl?: string;
  isStreaming?: boolean;
  followUpQuestions?: Array<{
    type: 'clarification' | 'suggestion';
    question: string;
    options?: string[];
  }>;
}

interface ChatStreamProps {
  onTicketCreated?: (ticketId: string) => void;
  userId?: string;
}

export default function ChatStream({ onTicketCreated, userId }: ChatStreamProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationId] = useState(`conv-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef<string>('');
  const currentAIMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Streaming text pentru răspuns AI
  const streamAIResponse = async (messageId: string, text: string) => {
    const words = text.split(' ');
    let currentText = '';
    
    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? ' ' : '') + words[i];
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId
          ? { ...msg, text: currentText, isStreaming: i < words.length - 1 }
          : msg
      ));
      
      // Mică pauză pentru efect natural
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
    }
    
    // Finalizează streaming
    setMessages(prev => prev.map(msg => 
      msg.id === messageId
        ? { ...msg, isStreaming: false }
        : msg
    ));
  };

  const handleSendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: userMessage,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Creează mesaj AI placeholder pentru streaming
      const aiMessageId = `ai-${Date.now()}`;
      currentAIMessageIdRef.current = aiMessageId;
      
      const aiMsg: Message = {
        id: aiMessageId,
        role: 'ai',
        text: '',
        isStreaming: true,
      };

      setMessages(prev => [...prev, aiMsg]);

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

      // Apelează chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
          userId,
          responseConfig: aiResponseConfig, // Trimite configurația personalizată
        }),
      });

      const data = await response.json();

      if (data.answer) {
        // Streaming text
        await streamAIResponse(aiMessageId, data.answer);
        
        // Actualizează mesajul cu follow-up questions
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId
            ? {
                ...msg,
                text: data.answer,
                isStreaming: false,
                followUpQuestions: data.followUpQuestions,
              }
            : msg
        ));
      }

      if (data.ticketCreated && onTicketCreated) {
        onTicketCreated(data.ticketId);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === currentAIMessageIdRef.current
          ? {
              ...msg,
              text: 'Îmi pare rău, a apărut o eroare. Te rugăm să încerci din nou.',
              isStreaming: false,
            }
          : msg
      ));
    } finally {
      setIsLoading(false);
      currentAIMessageIdRef.current = null;
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    setInput(transcript);
    handleSendMessage(transcript);
  };

  const handleFollowUpClick = (question: string, option: string) => {
    const fullMessage = `${question} ${option}`;
    handleSendMessage(fullMessage);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
      {/* Messages */}
      <div className="h-[500px] overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-block p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-12 h-12 text-blue-600 dark:text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Bună! Cu ce te pot ajuta?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Întreabă-mă despre produse, sau folosește căutarea vocală
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'ai' && (
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-wrap">
                  {message.text}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1"></span>
                  )}
                </p>
                
                {message.role === 'ai' && message.text && !message.isStreaming && (
                  <VoiceTTS
                    text={message.text}
                    autoPlay={message.id === messages[messages.length - 1]?.id && message.role === 'ai'}
                    addNaturalPauses={true}
                  />
                )}
              </div>

              {/* Follow-up Questions */}
              {message.followUpQuestions && message.followUpQuestions.length > 0 && (
                <div className="mt-4 space-y-2 pt-3 border-t border-gray-300 dark:border-gray-600">
                  {message.followUpQuestions.map((followUp, index) => (
                    <div key={index} className="space-y-2">
                      <p className="text-sm font-semibold opacity-90">
                        {followUp.question}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {followUp.options?.map((option, optIndex) => (
                          <button
                            key={optIndex}
                            onClick={() => handleFollowUpClick(followUp.question, option)}
                            disabled={isLoading}
                            className="px-3 py-1.5 text-xs bg-white/20 dark:bg-gray-600/50 hover:bg-white/30 dark:hover:bg-gray-600/70 rounded-lg transition-all disabled:opacity-50"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-700 dark:text-gray-300 font-bold text-sm">U</span>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">AI răspunde...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(input);
          }}
          className="flex items-center gap-3"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Scrie sau vorbește..."
              className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={isLoading}
            />
            
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <VoiceSearch
                onTranscript={handleVoiceTranscript}
                disabled={isLoading}
                className="w-6 h-6"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

