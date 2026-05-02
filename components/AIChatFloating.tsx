"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  buildProxiedAiChatBody,
  assistantTextFromProxiedResponse,
} from '@/lib/ai/externalChatPayload';
import { PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { FaceSmileIcon, PaperClipIcon, MicrophoneIcon } from '@heroicons/react/24/outline';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  selectedModel?: string;
  modelFallbackApplied?: boolean;
}

type Department = 'none' | 'support' | 'payments' | 'auctions' | 'account';

export default function AIChatFloating() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('none');
  const [hasWelcomed, setHasWelcomed] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [isInQueue, setIsInQueue] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queueIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get user avatar if logged in
    if (typeof window !== 'undefined') {
      try {
        const userInfoStr = localStorage.getItem('userInfo');
        if (userInfoStr) {
          const userInfo = JSON.parse(userInfoStr);
          if (userInfo.avatar) {
            setUserAvatar(userInfo.avatar);
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  useEffect(() => {
    // Send welcome message when chat opens for the first time
    if (isOpen && !hasWelcomed && messages.length === 0) {
      setHasWelcomed(true);
      const welcomeMessage: Message = {
        id: `msg_welcome_${Date.now()}`,
        role: 'assistant',
        content: 'Bună! 👋\n\nSunt Maria, asistenta ta virtuală. Cu ce te pot ajuta astăzi?',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, hasWelcomed, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Queue management: Decrease position at random intervals (1-4 minutes) and send updates only when position decreases
  useEffect(() => {
    if (!isInQueue || queuePosition === null || queuePosition <= 0) {
      if (queueIntervalRef.current) {
        clearTimeout(queueIntervalRef.current);
        queueIntervalRef.current = null;
      }
      return;
    }

    // Function to schedule next position decrease with random interval
    const scheduleNextDecrease = () => {
      // Clear any existing timeout
      if (queueIntervalRef.current) {
        clearTimeout(queueIntervalRef.current);
      }

      // Generate random interval between 1 and 4 minutes (60000ms to 240000ms)
      const randomInterval = Math.floor(Math.random() * (240000 - 60000 + 1)) + 60000;

      // Update position after random interval
      queueIntervalRef.current = setTimeout(() => {
        setQueuePosition(prev => {
          if (prev === null || prev <= 0) {
            setIsInQueue(false);
            return null;
          }

          const newPosition = prev - 1;

          // If position reaches 0, wait and then connect to operator
          if (newPosition === 0) {
            setIsInQueue(false);
            
            // Wait 3-5 seconds to simulate connection attempt
            setTimeout(() => {
              // Simulate: check if admin/operator is available
              const operatorNames = ['Maria Popescu', 'Ion Georgescu', 'Ana Ionescu', 'Alexandru Radu', 'Elena Stoica'];
              const randomOperator = operatorNames[Math.floor(Math.random() * operatorNames.length)];
              
              const operatorMessage: Message = {
                id: `msg_operator_online_${Date.now()}`,
                role: 'assistant',
                content: `✅ Acum sunt online! Bine ați venit! Sunt **${randomOperator}** și vă voi ajuta cu problema dumneavoastră. Cu ce vă pot asista? 😊`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, operatorMessage]);
            }, 3000 + Math.random() * 2000); // 3-5 seconds wait
            
            return null;
          }

          // Send position update message only when position decreases
          const positionMessage: Message = {
            id: `msg_queue_update_${Date.now()}`,
            role: 'assistant',
            content: `⏳ Vă rog să așteptați, sunteți poziția **${newPosition}** în coadă. Vă voi anunța când se apropie rândul dumneavoastră!\n\nÎntre timp, puteți să-mi spuneți mai multe despre problema dumneavoastră, iar eu voi încerca să vă ajut! 💬`,
            timestamp: new Date(),
          };
          setMessages(prevMessages => [...prevMessages, positionMessage]);

          // Schedule next decrease with new random interval
          scheduleNextDecrease();

          return newPosition;
        });
      }, randomInterval);
    };

    // Start the scheduling
    scheduleNextDecrease();

    // Cleanup
    return () => {
      if (queueIntervalRef.current) {
        clearTimeout(queueIntervalRef.current);
        queueIntervalRef.current = null;
      }
    };
  }, [isInQueue, queuePosition]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = messageText;
    setInput('');
    setIsLoading(true);

    try {
      // Build context message if user is in queue
      let contextMessage = currentInput;
      if (isInQueue && queuePosition !== null && queuePosition > 0) {
        contextMessage = `[Utilizatorul este în coadă, poziția ${queuePosition}. Încercă să ajut utilizatorul cu problema lui în timp ce așteaptă. Trebuie să fiu util și prietenos, să îl ajut să rezolve problema sau să clarific întrebările lui.]\n\n${currentInput}`;
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildProxiedAiChatBody({
            userMessage: contextMessage,
            conversationHistory: messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
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

      const aiMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        ...(selectedModel ? { selectedModel, modelFallbackApplied } : {}),
      };

      setMessages(prev => [...prev, aiMessage]);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCategoryClick = (category: string) => {
    const categoryMap: { [key: string]: { message: string; department: Department; response: string } } = {
      'Suport Tehnic': {
        message: 'Am o problemă tehnică și am nevoie de ajutor.',
        department: 'support',
        response: 'Înțeleg! Vă conectez acum la departamentul de Suport Tehnic. Un specialist vă va ajuta în cel mai scurt timp. 🔧\n\nÎn timp ce așteptați, puteți descrie problema pe care o întâmpinați?'
      },
      'Plăți și Facturare': {
        message: 'Am o întrebare despre plăți sau facturare.',
        department: 'payments',
        response: 'Perfect! Vă transfer acum la departamentul Plăți și Facturare. 💳\n\nEchipa noastră financiară vă va ajuta cu toate întrebările despre plăți, facturi și tranzacții.'
      },
      'Licitații': {
        message: 'Am o întrebare despre licitații.',
        department: 'auctions',
        response: 'Excelent! Vă conectez la departamentul Licitații. 🏆\n\nSpecialiștii noștri vă vor ghida cu informații despre licitații, participare și procesul de licitare.'
      },
      'Cont și Setări': {
        message: 'Am nevoie de ajutor cu contul sau setările.',
        department: 'account',
        response: 'Bineînțeles! Vă transfer la departamentul Cont și Setări. ⚙️\n\nEchipa noastră vă va ajuta cu gestionarea contului, setările și preferințele.'
      },
    };
    
    const categoryData = categoryMap[category];
    if (!categoryData) return;

    // Generate random queue position between 2 and 8
    const initialPosition = Math.floor(Math.random() * 7) + 2; // 2-8
    setQueuePosition(initialPosition);
    setIsInQueue(true);

    // Set selected department
    setSelectedDepartment(categoryData.department);

    // Send user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: categoryData.message,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI response after a short delay
    setTimeout(() => {
      const aiMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: `${categoryData.response}\n\n⏳ Vă rog să așteptați, sunteți poziția **${initialPosition}** în coadă. Vă voi anunța când se apropie rândul dumneavoastră!\n\nÎntre timp, puteți să-mi spuneți mai multe despre problema dumneavoastră, iar eu voi încerca să vă ajut! 💬`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const getBackgroundIcons = () => {
    const positions = [
      { top: '5%', left: '10%' }, { top: '15%', left: '75%' }, { top: '25%', left: '20%' },
      { top: '35%', left: '80%' }, { top: '45%', left: '15%' }, { top: '55%', left: '70%' },
      { top: '65%', left: '25%' }, { top: '75%', left: '85%' }, { top: '20%', left: '50%' },
      { top: '40%', left: '60%' }, { top: '60%', left: '40%' }, { top: '80%', left: '30%' },
      { top: '10%', left: '40%' }, { top: '30%', left: '90%' }, { top: '50%', left: '5%' },
      { top: '70%', left: '55%' }, { top: '85%', left: '15%' }, { top: '12%', left: '65%' },
      { top: '28%', left: '35%' }, { top: '48%', left: '95%' },
    ];

    switch (selectedDepartment) {
      case 'payments':
        return positions.slice(0, 15).map((pos, i) => (
          <div
            key={i}
            className="absolute text-green-300/30 text-5xl font-bold animate-pulse"
            style={{
              ...pos,
              transform: `rotate(${(i * 23) % 360}deg)`,
              pointerEvents: 'none',
              animationDelay: `${i * 0.2}s`,
              animationDuration: '3s',
            }}
          >
            {['€', '$', 'Lei', '£', '¥'][i % 5]}
          </div>
        ));
      case 'auctions':
        return positions.slice(0, 12).map((pos, i) => (
          <svg
            key={i}
            className="absolute text-green-300/25 w-14 h-14 animate-pulse"
            style={{
              ...pos,
              transform: `rotate(${(i * 30) % 360}deg)`,
              pointerEvents: 'none',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '4s',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        ));
      case 'support':
        return positions.slice(0, 10).map((pos, i) => (
          <svg
            key={i}
            className="absolute text-green-300/25 w-12 h-12 animate-pulse"
            style={{
              ...pos,
              transform: `rotate(${(i * 25) % 360}deg)`,
              pointerEvents: 'none',
              animationDelay: `${i * 0.18}s`,
              animationDuration: '3.5s',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ));
      case 'account':
        return positions.slice(0, 8).map((pos, i) => (
          <svg
            key={i}
            className="absolute text-green-300/25 w-10 h-10 animate-pulse"
            style={{
              ...pos,
              transform: `rotate(${(i * 20) % 360}deg)`,
              pointerEvents: 'none',
              animationDelay: `${i * 0.2}s`,
              animationDuration: '3s',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ));
      default:
        return null;
    }
  };

  // Floating Button
  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setSelectedDepartment('none');
          setHasWelcomed(false);
          setMessages([]);
          setQueuePosition(null);
          setIsInQueue(false);
        }}
        className="fixed bottom-6 right-6 z-[9999] w-16 h-16 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center"
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

  // Chat Window - WhatsApp Style
  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden"
      style={{
        width: '380px',
        height: '600px',
        maxHeight: 'calc(100vh - 100px)',
      }}
    >
      {/* WhatsApp Header */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
            <Image
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face"
              alt="Maria"
              width={40}
              height={40}
              className="w-full h-full object-cover"
              unoptimized
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = '<span class="text-lg text-[#075E54]">M</span>';
                }
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">Maria</h3>
            <p className="text-xs text-[#B2F5EA] truncate">online</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-full hover:bg-[#0A4D42] transition-colors"
        >
          <XMarkIcon className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Messages Area - WhatsApp Background */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1 relative"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23e5ddd5' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='%23e5ddd5'/%3E%3Crect width='100' height='100' fill='url(%23grid)' /%3E%3C/svg%3E")`,
          backgroundColor: '#e5ddd5',
        }}
      >
        {/* Background Icons */}
        {selectedDepartment !== 'none' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {getBackgroundIcons()}
          </div>
        )}

        <div className="relative z-10">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-1.5 mb-1 w-full`}
              style={{ flexDirection: 'row', flexWrap: 'nowrap', width: '100%' }}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                  <Image
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face"
                    alt="Maria"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                    unoptimized
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.style.display = 'none';
                      if (target.parentElement) {
                        target.parentElement.innerHTML = '<span class="text-xs text-gray-600">M</span>';
                      }
                    }}
                  />
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
                {msg.role === 'assistant' && msg.selectedModel && (
                  <span className="text-[9px] leading-tight text-[#8696a0] mt-0.5 block">
                    {msg.selectedModel}
                    {msg.modelFallbackApplied ? ' · gemma fallback' : ''}
                  </span>
                )}
                <div className={`flex items-center justify-end gap-1 mt-0.5 ${
                  msg.role === 'user' ? 'text-[#667781]' : 'text-[#667781]'
                }`}>
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
                  {userAvatar ? (
                    <Image
                      src={userAvatar}
                      alt="You"
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                      unoptimized
                      onError={() => {
                        setUserAvatar(null);
                      }}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-gray-600">U</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Show category options after welcome message */}
          {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isLoading && selectedDepartment === 'none' && (
            <div className="space-y-2 mt-3">
              <p className="text-xs text-gray-600 text-center mb-2 px-2">Alegeți o categorie:</p>
              <div className="grid grid-cols-1 gap-2">
                {['Suport Tehnic', 'Plăți și Facturare', 'Licitații', 'Cont și Setări'].map((category) => (
                  <button
                    key={category}
                    onClick={() => handleCategoryClick(category)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-[#dcf8c6] hover:border-[#25D366] transition-all text-left group shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#075E54]/10 flex items-center justify-center group-hover:bg-[#25D366]/20 transition-colors">
                        {category === 'Suport Tehnic' && (
                          <svg className="w-4 h-4 text-[#075E54] group-hover:text-[#25D366]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                        {category === 'Plăți și Facturare' && (
                          <svg className="w-4 h-4 text-[#075E54] group-hover:text-[#25D366]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        )}
                        {category === 'Licitații' && (
                          <svg className="w-4 h-4 text-[#075E54] group-hover:text-[#25D366]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {category === 'Cont și Setări' && (
                          <svg className="w-4 h-4 text-[#075E54] group-hover:text-[#25D366]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start items-end gap-1.5 mb-1">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-300 flex items-center justify-center">
                <Image
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face"
                  alt="Maria"
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                  unoptimized
                />
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

      {/* Input Area - WhatsApp Style */}
      <div className="bg-[#F0F2F5] px-3 py-2 border-t border-gray-200">
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Scrieți un mesaj"
            className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent text-sm text-gray-900 placeholder-gray-400"
          />
          {input.trim() ? (
            <button
              onClick={() => sendMessage()}
              disabled={isLoading}
              className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#20BA5A] text-white shadow-sm transition-all flex items-center justify-center hover:scale-110 active:scale-95"
            >
              <PaperAirplaneIcon className="w-5 h-5 rotate-45" />
            </button>
          ) : (
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#20BA5A] text-white shadow-sm transition-all flex items-center justify-center"
              title="Record voice"
            >
              <MicrophoneIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
