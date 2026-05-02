/**
 * ChatWidget.tsx
 * Container principal pentru widget-ul de chat WhatsApp Web
 * Coordonează toate componentele și gestionează state-ul global
 */

"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import ChatOptions from './ChatOptions';
import { saveMessage, getUserInfo, updateConversation, getMessages } from '@/lib/chat-storage';
import type { ChatMessage } from '@/lib/chat-storage';

// Dynamic imports pentru componente grele
const VoiceInput = dynamic(() => import('./VoiceInput'), { ssr: false });

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'admin' | 'system';
  content: string;
  timestamp: Date;
  department?: string;
  fallbackSuggested?: boolean;
}

type Department = 'none' | 'support' | 'payments' | 'auctions' | 'account';

const DEPARTMENTS = {
  support: { name: 'Suport Tehnic', icon: '🔧', description: 'Asistență tehnică și depanare' },
  payments: { name: 'Plăți și Facturare', icon: '💳', description: 'Plăți, facturi și tranzacții' },
  auctions: { name: 'Licitații', icon: '🏆', description: 'Informații despre licitații' },
  account: { name: 'Cont și Setări', icon: '⚙️', description: 'Gestionare cont și preferințe' },
};

export default function ChatWidget() {
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
  const [showOptions, setShowOptions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);
  const userInfoRef = useRef<ReturnType<typeof getUserInfo>>(null);

  // Initialize SpeechSynthesis și User Info
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      userInfoRef.current = getUserInfo();
    }
  }, []);

  // Initialize IndexedDB pentru istoric persistent
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initDB = async () => {
      try {
        const request = indexedDB.open('chat-widget-db', 1);
        
        request.onerror = () => console.error('IndexedDB error');
        request.onsuccess = () => {
          dbRef.current = request.result;
          loadConversationHistory();
        };
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('conversations')) {
            const store = db.createObjectStore('conversations', { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
          if (!db.objectStoreNames.contains('messages')) {
            const store = db.createObjectStore('messages', { keyPath: 'id' });
            store.createIndex('conversationId', 'conversationId', { unique: false });
          }
        };
      } catch (err) {
        console.error('DB init error:', err);
        // Fallback la LocalStorage
        loadConversationHistory();
      }
    };

    initDB();
  }, []);

  // Load conversation history
  const loadConversationHistory = async () => {
    try {
      if (dbRef.current) {
        const transaction = dbRef.current.transaction(['conversations'], 'readonly');
        const store = transaction.objectStore('conversations');
        const index = store.index('updatedAt');
        const request = index.openCursor(null, 'prev');
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const conv = cursor.value;
            setMessages(conv.messages || []);
            setConversationId(conv.id);
            setSelectedDepartment(conv.department || 'none');
          }
        };
      } else {
        const saved = localStorage.getItem('chat-widget-messages');
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

  // Save conversation
  const saveConversation = async (messages: Message[], department: Department) => {
    const convId = conversationId || `conv-${Date.now()}`;
    if (!conversationId) setConversationId(convId);

    const conversation = {
      id: convId,
      messages,
      department,
      updatedAt: new Date(),
    };

    try {
      if (dbRef.current) {
        const transaction = dbRef.current.transaction(['conversations'], 'readwrite');
        await transaction.objectStore('conversations').put(conversation);
      } else {
        localStorage.setItem('chat-widget-messages', JSON.stringify(conversation));
      }
    } catch (err) {
      console.error('Error saving conversation:', err);
    }
  };

  // Auto-scroll la mesaj nou
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Live sync: Ascultă pentru mesaje noi (inclusiv admin) din storage
  useEffect(() => {
    if (!conversationId || !isOpen) return;

    const loadMessagesFromStorage = () => {
      try {
        const storageMessages = getMessages(conversationId);
        console.log('[ChatWidget] Live sync - Loaded messages from storage:', storageMessages.length);
        
        // Convertește la formatul Message
        const formattedMessages: Message[] = storageMessages.map((msg: ChatMessage) => ({
          id: msg.id,
          role: msg.role === 'admin' ? 'admin' : msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          department: msg.department,
        }));

        // Actualizează doar dacă există diferențe
        const hasNewMessages = formattedMessages.length !== messages.length || 
          formattedMessages.some((msg, idx) => 
            !messages[idx] || messages[idx].id !== msg.id || messages[idx].content !== msg.content
          );

        if (hasNewMessages) {
          console.log('[ChatWidget] New messages detected, updating...');
          setMessages(formattedMessages);
        }
      } catch (err) {
        console.error('[ChatWidget] Error loading messages from storage:', err);
      }
    };

    // Load initial messages
    loadMessagesFromStorage();

    // Listen for storage updates
    const handleStorageUpdate = () => {
      loadMessagesFromStorage();
    };

    window.addEventListener('chat-storage-updated', handleStorageUpdate);

    // Poll every 500ms pentru sincronizare live
    const interval = setInterval(loadMessagesFromStorage, 500);

    return () => {
      clearInterval(interval);
      window.removeEventListener('chat-storage-updated', handleStorageUpdate);
    };
  }, [conversationId, isOpen, messages.length]);

  // Welcome message la deschidere
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
      setShowOptions(true);
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
      department: selectedDepartment !== 'none' ? selectedDepartment : undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setShowOptions(false);

    try {
      const conversationHistory = newMessages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

      // Obține user info
      const currentUserInfo = userInfoRef.current || getUserInfo();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversationHistory,
          conversationId: conversationId || undefined,
          userId: currentUserInfo?.userId || currentUserInfo?.email || 'anonymous',
          userName: currentUserInfo ? `${currentUserInfo.firstName || ''} ${currentUserInfo.lastName || ''}`.trim() : undefined,
          userAvatar: currentUserInfo?.avatar,
          userEmail: currentUserInfo?.email,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      const finalConvId = data.conversationId || conversationId || `conv-${Date.now()}`;
      if (!conversationId) setConversationId(finalConvId);

      // Salvează mesajul user-ului în storage (folosește currentUserInfo deja declarat mai sus)
      const userChatMessage: ChatMessage = {
        id: userMessage.id,
        role: 'user',
        content: messageText,
        timestamp: userMessage.timestamp.toISOString(),
        conversationId: finalConvId,
        userId: currentUserInfo?.userId || currentUserInfo?.email || 'anonymous',
        userName: currentUserInfo ? `${currentUserInfo.firstName || ''} ${currentUserInfo.lastName || ''}`.trim() : 'Utilizator',
        userAvatar: currentUserInfo?.avatar,
        department: selectedDepartment !== 'none' ? selectedDepartment : undefined,
      };
      saveMessage(userChatMessage);

      // Actualizează conversația
      updateConversation({
        id: finalConvId,
        userId: currentUserInfo?.userId || currentUserInfo?.email || 'anonymous',
        userName: currentUserInfo ? `${currentUserInfo.firstName || ''} ${currentUserInfo.lastName || ''}`.trim() : 'Utilizator',
        userEmail: currentUserInfo?.email,
        userAvatar: currentUserInfo?.avatar,
        lastMessage: messageText,
        lastMessageTime: userMessage.timestamp.toISOString(),
        department: selectedDepartment !== 'none' ? selectedDepartment : undefined,
      });

      const aiMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.answer || data.message || 'Îmi pare rău, nu am putut genera un răspuns.',
        timestamp: new Date(),
        department: selectedDepartment !== 'none' ? selectedDepartment : undefined,
        fallbackSuggested: data.needsHumanSupport || false,
      };

      // Salvează mesajul AI în storage
      const aiChatMessage: ChatMessage = {
        id: aiMessage.id,
        role: 'assistant',
        content: aiMessage.content,
        timestamp: aiMessage.timestamp.toISOString(),
        conversationId: finalConvId,
        userId: currentUserInfo?.userId || currentUserInfo?.email || 'anonymous',
        department: selectedDepartment !== 'none' ? selectedDepartment : undefined,
      };
      saveMessage(aiChatMessage);

      // Actualizează conversația cu ultimul mesaj AI
      updateConversation({
        id: finalConvId,
        lastMessage: aiMessage.content,
        lastMessageTime: aiMessage.timestamp.toISOString(),
      });

      const updatedMessages = [...newMessages, aiMessage];
      setMessages(updatedMessages);
      await saveConversation(updatedMessages, selectedDepartment);

      // Text-to-speech
      if (aiMessage.content && synthRef.current) {
        speak(aiMessage.content);
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

  // Fallback la browser TTS
  const fallbackToBrowserTTS = useCallback((text: string) => {
    if (!synthRef.current) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthRef.current.speak(utterance);
  }, []);

  // Text-to-speech cu ElevenLabs (cu fallback la browser TTS)
  const speak = useCallback(async (text: string) => {
    if (!text) return;
    
    setIsSpeaking(true);
    
    try {
      // Folosește ElevenLabs pentru TTS
      const response = await fetch('/api/voice-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          voiceId: process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      // Obține audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Redă audio
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        // Fallback la browser TTS dacă ElevenLabs eșuează
        fallbackToBrowserTTS(text);
      };
      audio.play();
    } catch (error) {
      console.error('ElevenLabs TTS error:', error);
      setIsSpeaking(false);
      // Fallback la browser TTS
      fallbackToBrowserTTS(text);
    }
  }, [fallbackToBrowserTTS]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    // Oprește browser TTS
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    // Oprește audio playback (pentru ElevenLabs)
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setIsSpeaking(false);
  }, []);

  // Handle voice transcription
  const handleVoiceTranscription = useCallback((transcribedText: string) => {
    setInput(transcribedText);
    setIsListening(false);
    if (transcribedText.trim()) {
      setTimeout(() => sendMessage(transcribedText), 100);
    }
  }, [sendMessage]);

  // Handle department selection
  const handleDepartmentSelect = (dept: Exclude<Department, 'none'>) => {
    setSelectedDepartment(dept);
    setShowOptions(false);
    
    const deptMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Am selectat departamentul: ${DEPARTMENTS[dept].name}`,
      timestamp: new Date(),
      department: dept,
    };

    const newMessages = [...messages, deptMessage];
    setMessages(newMessages);

    setTimeout(() => {
      const aiResponse: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Perfect! Vă conectez la departamentul ${DEPARTMENTS[dept].name}. ${DEPARTMENTS[dept].icon}\n\nCum vă pot ajuta?`,
        timestamp: new Date(),
        department: dept,
      };
      setMessages(prev => [...prev, aiResponse]);
      saveConversation([...newMessages, aiResponse], dept);
    }, 500);
  };

  // Handle WhatsApp fallback
  const handleWhatsAppFallback = () => {
    const phoneNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '+40712345678';
    const message = encodeURIComponent(
      `Bună! Am o întrebare despre: ${DEPARTMENTS[selectedDepartment as keyof typeof DEPARTMENTS]?.name || 'suport general'}\n\nConversație ID: ${conversationId || 'N/A'}`
    );
    
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  // Floating Button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] w-16 h-16 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center"
        aria-label="Deschide chat"
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
      <ChatHeader
        isMinimized={isMinimized}
        isSpeaking={isSpeaking}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
        onClose={() => {
          setIsOpen(false);
          stopSpeaking();
        }}
      />

      {!isMinimized && (
        <>
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onWhatsAppFallback={handleWhatsAppFallback}
          />

          {showOptions && (
            <ChatOptions
              departments={DEPARTMENTS}
              onSelect={handleDepartmentSelect}
            />
          )}

          <ChatInput
            input={input}
            inputRef={inputRef}
            isListening={isListening}
            isLoading={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onSend={sendMessage}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            onMicrophoneClick={() => setIsListening(!isListening)}
          />

          {isListening && (
            <div className="px-3 pb-2">
              <VoiceInput
                onTranscription={handleVoiceTranscription}
                onStop={() => setIsListening(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
