/**
 * WhatsApp Chat Widget - Enterprise AI Chat cu Fallback WhatsApp
 * 
 * Features:
 * - Widget compact stil WhatsApp Web
 * - 4 opțiuni: Support tehnic, Plăți, Licitații, Cont și setări
 * - AI Chat cu GPT-4o + voice streaming
 * - Speech-to-text (Whisper) + Text-to-speech
 * - Istoric conversație LocalStorage/IndexedDB
 * - Fallback către WhatsApp real
 */

"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { 
  PaperAirplaneIcon, 
  XMarkIcon,
  PhoneIcon,
  MicrophoneIcon 
} from '@heroicons/react/24/solid';
import { 
  FaceSmileIcon, 
  PaperClipIcon 
} from '@heroicons/react/24/outline';

// Dynamic imports pentru componente mari
const VoiceInput = dynamic(() => import('./VoiceInput'), { ssr: false });
const AnimatedAvatar = dynamic(() => import('./AnimatedAvatar'), { ssr: false });

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  department?: Department;
  audioUrl?: string;
  fallbackSuggested?: boolean; // AI a sugerat fallback către WhatsApp
}

type Department = 'none' | 'support' | 'payments' | 'auctions' | 'account';

interface Conversation {
  id: string;
  messages: Message[];
  department: Department;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
}

const DEPARTMENTS = {
  support: {
    name: 'Suport Tehnic',
    icon: '🔧',
    description: 'Asistență tehnică și depanare'
  },
  payments: {
    name: 'Plăți și Facturare',
    icon: '💳',
    description: 'Plăți, facturi și tranzacții'
  },
  auctions: {
    name: 'Licitații',
    icon: '🏆',
    description: 'Informații despre licitații'
  },
  account: {
    name: 'Cont și Setări',
    icon: '⚙️',
    description: 'Gestionare cont și preferințe'
  }
};

export default function WhatsAppChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('none');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasWelcomed, setHasWelcomed] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);

  // Initialize IndexedDB pentru stocare persistentă
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initDB = async () => {
      return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('whatsapp-chat-db', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Store pentru conversații
          if (!db.objectStoreNames.contains('conversations')) {
            const store = db.createObjectStore('conversations', { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
            store.createIndex('userId', 'userId', { unique: false });
          }
          
          // Store pentru mesaje
          if (!db.objectStoreNames.contains('messages')) {
            const store = db.createObjectStore('messages', { keyPath: 'id' });
            store.createIndex('conversationId', 'conversationId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    };

    initDB()
      .then(db => {
        dbRef.current = db;
        loadConversationHistory();
      })
      .catch(err => {
        console.error('IndexedDB init error:', err);
        // Fallback la LocalStorage
        loadConversationHistory();
      });
  }, []);

  // Initialize SpeechSynthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Load conversation history din IndexedDB sau LocalStorage
  const loadConversationHistory = async () => {
    try {
      if (dbRef.current) {
        // Load din IndexedDB
        const transaction = dbRef.current.transaction(['conversations'], 'readonly');
        const store = transaction.objectStore('conversations');
        const index = store.index('updatedAt');
        const request = index.openCursor(null, 'prev'); // Cel mai recent
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const conv: Conversation = cursor.value;
            setMessages(conv.messages || []);
            setConversationId(conv.id);
            setSelectedDepartment(conv.department);
            cursor.continue();
          }
        };
      } else {
        // Fallback la LocalStorage
        const saved = localStorage.getItem('whatsapp-chat-messages');
        if (saved) {
          const parsed = JSON.parse(saved);
          setMessages(parsed.messages || []);
          setConversationId(parsed.conversationId);
          setSelectedDepartment(parsed.department || 'none');
        }
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  // Save conversation history
  const saveConversation = async (messages: Message[], department: Department) => {
    const convId = conversationId || `conv-${Date.now()}`;
    if (!conversationId) setConversationId(convId);

    const conversation: Conversation = {
      id: convId,
      messages,
      department,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined
    };

    try {
      if (dbRef.current) {
        // Save în IndexedDB
        const transaction = dbRef.current.transaction(['conversations'], 'readwrite');
        const store = transaction.objectStore('conversations');
        await store.put(conversation);
      } else {
        // Fallback la LocalStorage
        localStorage.setItem('whatsapp-chat-messages', JSON.stringify(conversation));
      }

      // Save individual messages pentru căutare
      if (dbRef.current) {
        const transaction = dbRef.current.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        messages.forEach(msg => {
          store.put({ ...msg, conversationId: convId });
        });
      }
    } catch (err) {
      console.error('Error saving conversation:', err);
    }
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message când se deschide chat-ul
  useEffect(() => {
    if (isOpen && !hasWelcomed && messages.length === 0) {
      setHasWelcomed(true);
      const welcomeMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Bună! 👋\n\nSunt Maria, asistenta ta virtuală. Cu ce te pot ajuta astăzi?',
        timestamp: new Date(),
      };
      setMessages([welcomeMsg]);
    }
  }, [isOpen, hasWelcomed, messages.length]);

  // Send message
  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      department: selectedDepartment,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Construiește context pentru AI
      const conversationHistory = newMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch('/api/whatsapp-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversationHistory,
          conversationId: conversationId || undefined,
          department: selectedDepartment,
          userId: typeof window !== 'undefined' ? localStorage.getItem('userId') : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        department: selectedDepartment,
        fallbackSuggested: data.fallbackSuggested || false,
      };

      const updatedMessages = [...newMessages, aiMessage];
      setMessages(updatedMessages);

      // Save conversation
      await saveConversation(updatedMessages, selectedDepartment);

      // Text-to-speech dacă e activat
      if (data.message && typeof window !== 'undefined' && synthRef.current) {
        speak(data.message);
      }

      // Actualizează conversation ID dacă e nou
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: 'Îmi pare rău, am întâmpinat o eroare. Te rog încearcă din nou sau contactează-ne prin WhatsApp.',
        timestamp: new Date(),
        fallbackSuggested: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, input, isLoading, selectedDepartment, conversationId]);

  // Text-to-speech
  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;

    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  }, []);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // Handle voice transcription
  const handleVoiceTranscription = useCallback((transcribedText: string) => {
    setInput(transcribedText);
    setIsListening(false);
    // Auto-send dacă e text valid
    if (transcribedText.trim()) {
      setTimeout(() => sendMessage(transcribedText), 100);
    }
  }, [sendMessage]);

  // Handle department selection
  const handleDepartmentSelect = (dept: string) => {
    if (dept === 'none' || !(dept in DEPARTMENTS)) return;
    
    const department = dept as Exclude<Department, 'none'>;
    setSelectedDepartment(department);
    
    const deptMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Am selectat departamentul: ${DEPARTMENTS[department].name}`,
      timestamp: new Date(),
      department: department,
    };

    const newMessages = [...messages, deptMessage];
    setMessages(newMessages);

    // AI response pentru departament
    setTimeout(() => {
      const aiResponse: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Perfect! Vă conectez la departamentul ${DEPARTMENTS[department].name}. ${DEPARTMENTS[department].icon}\n\nCum vă pot ajuta?`,
        timestamp: new Date(),
        department: department,
      };
      setMessages(prev => [...prev, aiResponse]);
      saveConversation([...newMessages, aiResponse], department);
    }, 500);
  };

  // Handle WhatsApp fallback
  const handleWhatsAppFallback = () => {
    const phoneNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '+40712345678';
    const deptName = selectedDepartment !== 'none' && selectedDepartment in DEPARTMENTS
      ? DEPARTMENTS[selectedDepartment as keyof typeof DEPARTMENTS].name
      : 'suport general';
    const message = encodeURIComponent(
      `Bună! Am o întrebare despre: ${deptName}\n\nConversație ID: ${conversationId || 'N/A'}`
    );
    
    // Deep link WhatsApp
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  // Handle keyboard
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Floating Button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] w-16 h-16 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center"
        aria-label="Deschide chat WhatsApp"
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

  // Chat Window
  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ${
        isMinimized ? 'w-80 h-14' : 'w-96 h-[600px]'
      }`}
      style={{
        maxHeight: 'calc(100vh - 100px)',
        maxWidth: 'calc(100vw - 48px)',
      }}
    >
      {/* Header */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
            <span className="text-xl">👋</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">Asistent Virtual</h3>
            <p className="text-xs text-[#B2F5EA] truncate">online</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMinimized && (
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
              aria-label="Maximizează chat"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
          {!isMinimized && (
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
              aria-label="Minimizează chat"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              setIsOpen(false);
              stopSpeaking();
            }}
            className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
            aria-label="Închide chat"
          >
            <XMarkIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages Area */}
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
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-1.5 mb-1 w-full`}
                  style={{ flexDirection: 'row', flexWrap: 'nowrap', width: '100%' }}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                      <span className="text-xs">🤖</span>
                    </div>
                  )}

                  <div
                    className={`rounded-lg px-2 py-1.5 shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-[#dcf8c6] text-gray-900 rounded-br-none'
                        : 'bg-white text-gray-900 rounded-bl-none'
                    }`}
                    style={{
                      maxWidth: '75%',
                      minWidth: '0',
                      display: 'flex',
                      flexDirection: 'column',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div className="text-sm leading-relaxed" style={{
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      display: 'block',
                      writingMode: 'horizontal-tb',
                      direction: 'ltr',
                      unicodeBidi: 'embed',
                      margin: 0,
                      padding: 0,
                      lineHeight: '1.4'
                    }}>{String(msg.content).replace(/[\r\n\v\f]+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()}</div>
                    
                    {/* Fallback WhatsApp button */}
                    {msg.fallbackSuggested && msg.role === 'assistant' && (
                      <button
                        onClick={handleWhatsAppFallback}
                        className="mt-2 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BA5A] text-white text-xs rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <PhoneIcon className="w-4 h-4" />
                        Contactează prin WhatsApp
                      </button>
                    )}

                    <div className={`flex items-center justify-end gap-1 mt-0.5 ${msg.role === 'user' ? 'text-[#667781]' : 'text-[#667781]'}`}>
                      <span className="text-[10px] leading-none">
                        {new Date(msg.timestamp).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.role === 'user' && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 15">
                          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.175a.365.365 0 0 0-.063-.51z"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                      <span className="text-xs font-semibold text-gray-600">U</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Department Selection - Doar dacă nu e selectat */}
              {selectedDepartment === 'none' && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isLoading && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs text-gray-600 text-center mb-2 px-2">Alegeți un departament:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(DEPARTMENTS).map(([key, dept]) => (
                      <button
                        key={key}
                        onClick={() => handleDepartmentSelect(key as Department)}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-[#dcf8c6] hover:border-[#25D366] transition-all text-left group shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{dept.icon}</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{dept.name}</div>
                            <div className="text-xs text-gray-500">{dept.description}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Typing Indicator */}
              {isLoading && (
                <div className="flex justify-start items-end gap-1.5 mb-1">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                    <span className="text-xs">🤖</span>
                  </div>
                  <div className="bg-white px-3 py-2 rounded-lg rounded-bl-none shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="bg-[#F0F2F5] px-3 py-2 border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                title="Emoji"
              >
                <FaceSmileIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                title="Attachment"
              >
                <PaperClipIcon className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scrieți un mesaj"
                className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
                disabled={isLoading}
              />
              {input.trim() ? (
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading}
                  className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#20BA5A] text-white shadow-sm transition-all flex items-center justify-center hover:scale-110 active:scale-95"
                  aria-label="Trimite mesaj"
                >
                  <PaperAirplaneIcon className="w-5 h-5 rotate-45" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsListening(!isListening)}
                  className={`w-9 h-9 rounded-full ${isListening ? 'bg-red-500' : 'bg-[#25D366]'} hover:bg-[#20BA5A] text-white shadow-sm transition-all flex items-center justify-center`}
                  title="Record voice"
                  aria-label="Înregistrare vocală"
                >
                  <MicrophoneIcon className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Voice Input Component */}
            {isListening && (
              <div className="mt-2">
                <VoiceInput
                  onTranscription={handleVoiceTranscription}
                  onStop={() => setIsListening(false)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
