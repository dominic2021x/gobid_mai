"use client";

import React, { useState, useRef, useEffect } from 'react';
import VoiceSearch from './VoiceSearch';
import VoiceTTS from './VoiceTTS';

interface ProductVoiceSearchProps {
  onSearch: (query: string) => void;
  onResults: (results: any[]) => void;
  userId?: string;
}

export default function ProductVoiceSearch({ onSearch, onResults, userId }: ProductVoiceSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string>('');
  const [voiceMessage, setVoiceMessage] = useState<string>('');
  const [showVoiceOutput, setShowVoiceOutput] = useState(false);
  const conversationRef = useRef<string>(`conv-${Date.now()}`);

  const handleSearch = async (searchQuery: string, isVoice: boolean = false) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError('');
    setQuery(searchQuery);

    try {
      // Search semantic
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId && { 'user-id': userId }),
        },
        body: JSON.stringify({
          query: searchQuery,
          voice: isVoice,
          limit: 10,
        }),
      });

      const searchData = await searchResponse.json();

      if (searchData.error) {
        throw new Error(searchData.error);
      }

      // Verifică dacă există mesaje de token
      const blockedResults = searchData.results?.filter((r: any) => r.requiresToken && r.tokenMessage);
      
      if (blockedResults && blockedResults.length > 0) {
        // Generează mesaj vocal
        const tokenMessage = blockedResults[0].tokenMessage;
        setVoiceMessage(tokenMessage);
        setShowVoiceOutput(true);
        
        // Anunță verbal dacă e voice search
        if (isVoice) {
          // Mesajul va fi redat automat de VoiceOutput
        }
      }

      // Filtrează rezultatele cu acces
      const accessibleResults = searchData.results?.filter((r: any) => !r.requiresToken || r.tokenMessage) || [];
      
      setResults(accessibleResults);
      onResults(accessibleResults);
      
      // Dacă nu sunt rezultate, încearcă chat AI
      if (accessibleResults.length === 0 && !blockedResults) {
        await handleChatFollowUp(searchQuery);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Eroare la căutare');
    } finally {
      setIsSearching(false);
    }
  };

  const handleChatFollowUp = async (chatMessage: string) => {
    try {
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chatMessage,
          conversationId: conversationRef.current,
          userId,
        }),
      });

      const chatData = await chatResponse.json();

      if (chatData.answer) {
        // Afișează răspuns AI
        setVoiceMessage(chatData.answer);
        setShowVoiceOutput(true);

        // Dacă are follow-up questions, le afișează
        if (chatData.followUpQuestions && chatData.followUpQuestions.length > 0) {
          // Va fi gestionat în UI
          return chatData.followUpQuestions;
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    handleSearch(transcript, true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query, false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Search Form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Caută produse... sau vorbește 🎤"
              className="w-full px-6 py-4 text-lg rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-4 focus:ring-blue-400/30 focus:border-blue-500 transition-all"
              disabled={isSearching}
            />
            
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <VoiceSearch
                onTranscript={handleVoiceTranscript}
                disabled={isSearching}
                className="w-6 h-6"
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            {isSearching ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>Caută...</span>
              </div>
            ) : (
              'Caută'
            )}
          </button>
        </div>
      </form>

      {/* Voice Output */}
      {showVoiceOutput && voiceMessage && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <p className="text-blue-800 dark:text-blue-200 flex-1">{voiceMessage}</p>
            <VoiceTTS
              text={voiceMessage}
              autoPlay={true}
              addNaturalPauses={true}
              onEnd={() => setShowVoiceOutput(false)}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => (
            <div
              key={result.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              {result.image && (
                <img
                  src={result.image}
                  alt={result.title}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
                {result.title}
              </h3>
              
              {result.category && (
                <span className="inline-block px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 mb-2">
                  {result.category}
                </span>
              )}
              
              {result.brand && (
                <span className="inline-block px-3 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 mb-2 ml-2">
                  {result.brand}
                </span>
              )}
              
              {result.price && (
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  {new Intl.NumberFormat('ro-RO', {
                    style: 'currency',
                    currency: 'RON',
                  }).format(result.price)}
                </p>
              )}
              
              <p className="text-gray-600 dark:text-gray-400 line-clamp-3 text-sm">
                {result.description}
              </p>
              
              {result.requiresToken && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm font-semibold">
                    🔒 Acces necesită token
                  </p>
                  {result.tokensRemaining !== undefined && (
                    <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">
                      Tokeni disponibili: {result.tokensRemaining}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

