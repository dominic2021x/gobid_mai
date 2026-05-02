"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProductVoiceSearch from '@/components/ProductVoiceSearch';
import UniversalHeader from '@/components/UniversalHeader';
import { BackButton } from '@/components/ui/back-button';
import ChatStream from '@/components/ChatStream';

export default function VoiceSearchPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      setIsDarkMode(saved === 'true');
      
      const savedUserInfo = localStorage.getItem('userInfo');
      if (savedUserInfo) {
        setUserInfo(JSON.parse(savedUserInfo));
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode);
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
      document.documentElement.classList.toggle('dark', newMode);
    }
  };

  const handleResults = async (searchResults: any[]) => {
    // Verifică accesul token pe client pentru fiecare rezultat
    if (typeof window !== 'undefined') {
      const { checkTokenAccess } = await import('@/lib/ai/token-checker');
      
      const resultsWithAccess = searchResults.map((result) => {
        const tokenCheck = checkTokenAccess(userInfo?.email, result.id);
        
        return {
          ...result,
          requiresToken: !tokenCheck.hasAccess,
          tokenMessage: tokenCheck.hasAccess ? undefined : tokenCheck.message,
          tokensRemaining: tokenCheck.tokensRemaining,
        };
      });

      setResults(resultsWithAccess);
    } else {
      setResults(searchResults);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      
      <main className="container mx-auto py-8 px-4">
        <div className="mb-6 flex justify-center">
          <BackButton fallbackHref="/dashboard" label="Înapoi" />
        </div>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent mb-2">
            Căutare Vocală AI
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Caută produse cu voce sau text • AI cu follow-up questions
          </p>
        </div>

        {/* Voice Search Component */}
        <ProductVoiceSearch
          onSearch={(query) => console.log('Search:', query)}
          onResults={handleResults}
          userId={userInfo?.email}
        />

        {/* Chat AI Stream */}
        <div className="mt-8">
          <ChatStream
            onTicketCreated={(ticketId) => {
              console.log('Ticket created:', ticketId);
            }}
            userId={userInfo?.email}
          />
        </div>
      </main>
    </div>
  );
}

