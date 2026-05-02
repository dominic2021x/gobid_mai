"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import VoiceSearch from './VoiceSearch';

// Helper pentru a genera răspuns AI vocal
async function generateVoiceResponse(query: string): Promise<string | null> {
  try {
    // Generează răspuns AI folosind GPT-4o
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: query,
        conversationId: `voice-search-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      console.error('AI response error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.answer || null;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return null;
  }
}

// ELIMINAT: speakText - folosim doar speak() din componentă pentru consistență

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category?: string;
  price?: number;
  image?: string;
  url?: string;
  score: number;
  type: 'product' | 'page';
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  corrected?: string;
  variants?: string[];
  voice: boolean;
  total: number;
  time: number;
  error?: string;
}

export default function SearchInterface() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchMeta, setSearchMeta] = useState<{
    corrected?: string;
    time?: number;
    total?: number;
  }>({});
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  const TRENDING_SUGGESTIONS = [
    'Apartamente', 'Autoturisme', 'Piese auto', 'Terenuri', 'Spațiu comercial',
    'iPhone', 'Laptop', 'Mobilier',
  ];

  // Fetch suggestions cu debounce 140ms; q.length < 2 → trending local (no fetch); AbortController la nou input
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      if (q.length === 0) {
        setSuggestions([]);
        setShowSuggestions(false);
      } else {
        setSuggestions(TRENDING_SUGGESTIONS);
        setShowSuggestions(true);
        setSelectedSuggestionIndex(-1);
      }
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (suggestAbortRef.current) suggestAbortRef.current.abort();
      suggestAbortRef.current = new AbortController();
      const signal = suggestAbortRef.current.signal;
      try {
        const response = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(q)}&limit=10`,
          { signal }
        );
        const data = await response.json();
        if (signal.aborted) return;
        const raw = data.suggestions ?? [];
        if (Array.isArray(raw) && raw.length > 0) {
          setSuggestions(raw);
          setShowSuggestions(true);
          setSelectedSuggestionIndex(-1);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error fetching suggestions:', error);
          setSuggestions([]);
        }
      }
    }, 140);
  }, []);

  // Effect pentru suggestions când query se schimbă
  useEffect(() => {
    fetchSuggestions(query);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, fetchSuggestions]);

  // Close suggestions când se dă click în afara
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (searchQuery: string, isVoice = false) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    setShowSuggestions(false);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          voice: isVoice,
          limit: 5,
        }),
      });

      const data: SearchResponse = await response.json();

      if (data.error) {
        console.error('Search error:', data.error);
        setResults([]);
        return;
      }

      setResults(data.results || []);
      setSearchMeta({
        corrected: data.corrected,
        time: data.time,
        total: data.total,
      });

      // Dacă query-ul a fost corectat, actualizează input-ul
      if (data.corrected && data.corrected !== searchQuery) {
        setQuery(data.corrected);
      }
    } catch (error) {
      console.error('Error performing search:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ref pentru a gestiona audio-ul curent (pentru a opri vocea anterioară)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Funcție pentru a vorbi text folosind doar /api/voice (AI naturală)
  const speak = useCallback(async (text: string) => {
    if (!text) return;

    // Verifică dacă TTS este enabled
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const enabledResponse = await fetch('/api/tts/enabled', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        
        if (enabledResponse.ok) {
          const { enabled } = await enabledResponse.json();
          if (!enabled) {
            // TTS este dezactivat - nu vorbim
            return;
          }
        }
      }
    } catch (error) {
      // Continuă dacă verificarea eșuează (pentru compatibilitate)
      console.warn('Could not check TTS enabled status:', error);
    }

    try {
      // Oprește orice audio care rulează deja
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }
      
      // Oprește toate elementele audio care rulează (pentru siguranță)
      const allAudioElements = document.querySelectorAll('audio');
      allAudioElements.forEach(audio => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
      
      // Oprește speechSynthesis dacă există (pentru siguranță)
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      // Verifică preferința din localStorage pentru provider
      const savedProvider = typeof window !== 'undefined' ? localStorage.getItem('tts_provider') : null;
      const savedElevenLabsVoice = typeof window !== 'undefined' ? localStorage.getItem('tts_elevenlabs_voice') : null;
      const savedOpenAIVoice = typeof window !== 'undefined' ? localStorage.getItem('tts_openai_voice') : null;

      // Folosește doar /api/voice pentru voce AI naturală
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          provider: savedProvider || undefined,
          voiceId: savedElevenLabsVoice || undefined,
          voice: savedOpenAIVoice || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Voice API error: ${response.status}`);
      }

      // Obține audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Redă audio
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          resolve();
        };
        audio.onerror = (err) => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          reject(err);
        };
        audio.play().catch(reject);
      });
    } catch (error: any) {
      console.error('[AI Voice] Error speaking:', error);
      // NU folosim fallback la speechSynthesis - doar logăm eroarea
      // Vocea AI trebuie să funcționeze, altfel nu redăm nimic
      throw error;
    }
  }, []);

  // Funcție inteligentă pentru a normaliza și curăța query-ul - extrage esența chiar și cu greșeli
  const normalizeQuery = useCallback((rawText: string): string => {
    let cleaned = rawText.toLowerCase().trim();
    
    // Corecții inteligente pentru greșeli comune de transcriere
    const corrections: Record<string, string> = {
      // Orașe (variante multiple)
      'broșov': 'brașov',
      'brasov': 'brașov',
      'brosov': 'brașov',
      'bucuresti': 'bucurești',
      'bucurest': 'bucurești',
      'cluj': 'cluj',
      'timisoara': 'timișoara',
      'timisora': 'timișoara',
      'iasi': 'iași',
      'constanta': 'constanța',
      // Numere - PĂSTRĂM "două" pentru că e mai natural în română (două camere, două băi, etc.)
      // Nu transformăm "două" în "2" pentru a păstra naturalitatea limbii române
      'doua': 'două', // Corectează "doua" fără diacritice în "două"
      'doi': 'două', // Corectează "doi" (masculin) în "două" (feminin/neutru) pentru camere, băi, etc.
      'trei': '3',
      'patru': '4',
      'cinci': '5',
      'șase': '6',
      'sase': '6',
      'șapte': '7',
      'sapte': '7',
      'opt': '8',
      'nouă': '9',
      'noua': '9',
      'zece': '10',
      // Variante comune de cuvinte
      'câte': '',
      'cate': '',
      'cauta': '',
      'apartamente': 'apartament',
      'apartament': 'apartament',
      'camere': 'camere',
      'camera': 'camere',
      'cameră': 'camere',
      'cămară': 'camere',
      // Mașini - corecții pronunție BMW
      'bemveu': 'bmw',
      'bemve': 'bmw',
      'bemv': 'bmw',
      'beemve': 'bmw',
      'beemveu': 'bmw',
      'bmv': 'bmw',
      // Motorizare
      'litri': 'l',
      'litru': 'l',
      'de 2 litri': '2.0',
      'de 2.0 litri': '2.0',
      'motor 2': '2.0',
      'motor 2.0': '2.0',
    };
    
    // Aplică corecții (ordine importantă - mai specific înainte de general)
    Object.entries(corrections).forEach(([wrong, correct]) => {
      if (correct) {
        cleaned = cleaned.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), correct);
      } else {
        // Dacă corecția e goală, elimină cuvântul
        cleaned = cleaned.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), '');
      }
    });
    
    // Elimină toate formulările comune de început (variante multiple și greșeli)
    cleaned = cleaned
      // "caută un", "caut un", "caută o", "câte un", "cate un", etc.
      .replace(/^(caut(ă|a)?|câte|cate)\s+(un|o|ună)?\s*/i, "")
      // "este un", "este o", "este vreun", "e un", "e o", etc.
      .replace(/^(este|e)\s+(vreun|un|o|ună)?\s*/i, "")
      // "poți să", "poți să-mi", "poți să-mi arăți", "poti sa", etc.
      .replace(/^pot(i|e)?\s+s(ă|a)?\s*(mi)?\s*(arăți|găsești|cauți|gasesti|cauti)?\s*/i, "")
      // "vreau să", "vreau să caut", "aș vrea", "as vrea", etc.
      .replace(/^(vreau|aș\s+vrea|as\s+vrea)\s+(să|sa)?\s*(caut|caută|găsesc|găsească|gasesti)?\s*/i, "")
      // "ai", "ai vreun", "ai un", etc.
      .replace(/^ai\s+(vreun|un|o|ună)?\s*/i, "")
      // "ar fi", "ar fi vreun", etc.
      .replace(/^ar\s+fi\s+(vreun|un|o|ună)?\s*/i, "")
      // "exista", "există", "exista vreun", etc.
      .replace(/^exist(ă|a)?\s+(vreun|un|o|ună)?\s*/i, "")
      // "imi trebuie", "îmi trebuie", "imi trebuie un", etc.
      .replace(/^(imi|îmi)\s+trebuie\s+(un|o|ună)?\s*/i, "")
      // "te rog", "vă rog", "te rog sa", etc.
      .replace(/\s+(te|vă)\s+rog\s*/gi, " ")
      // "în", "in", "prin", "la", "pe" la început (dacă nu e parte din nume de oraș)
      .replace(/^(în|in|prin|la|pe)\s+(?!brașov|bucurești|cluj|timisoara|iasi|constanta|brasov|brosov)/i, "")
      // Punctuație finală
      .replace(/[\.,!?]+$/, "")
      // Spații multiple
      .replace(/\s+/g, " ")
      .trim();

    // Dacă query-ul este gol după curățare, folosește textul original
    if (!cleaned || cleaned.length < 3) {
      cleaned = rawText.toLowerCase().trim();
    }

    // Capitalizare prima literă și orașe importante
    let normalizedQuery = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    
    // Capitalizează orașe importante (după normalizare)
    normalizedQuery = normalizedQuery
      .replace(/\bbrașov\b/gi, 'Brașov')
      .replace(/\bbucurești\b/gi, 'București')
      .replace(/\bcluj\b/gi, 'Cluj')
      .replace(/\btimișoara\b/gi, 'Timișoara')
      .replace(/\biași\b/gi, 'Iași')
      .replace(/\bconstanța\b/gi, 'Constanța');
    
    return normalizedQuery;
  }, []);

  // ELIMINAT: waitForConfirmation - nu mai este necesar, navigăm direct

  // ✅ Ascultă evenimentul voice-transcript-ready pentru navigare directă (FĂRĂ confirmare)
  useEffect(() => {
    let isProcessing = false; // Flag pentru a preveni procesarea multiplă

    const handleVoiceInput = async (e: CustomEvent) => {
      // Ignoră dacă procesăm deja un input
      if (isProcessing) {
        return;
      }

      const rawText = e.detail.text;

      // Verifică dacă este un răspuns DA/NU (scurt, < 15 caractere)
      const isShortAnswer = rawText.length < 15;
      const isYesAnswer = /^(da|dea|aha|corect|exact|sigur|bine|ok|okay|yes|yep|da da|da corect)$/i.test(rawText.trim());
      const isNoAnswer = /^(nu|negativ|greșit|incorect|no|nope|nu nu|nu prea)$/i.test(rawText.trim());
      
      // Dacă este un răspuns DA/NU, ignoră (ar putea fi din alt context)
      if (isShortAnswer && (isYesAnswer || isNoAnswer)) {
        return;
      }

      // Normalizează query-ul
      let normalizedQuery = normalizeQuery(rawText);

      // Dacă normalizarea nu a extras esența corect, folosește AI pentru înțelegere mai bună
      // Verifică dacă query-ul normalizat este prea similar cu originalul (nu s-a normalizat bine)
      const similarity = normalizedQuery.toLowerCase() === rawText.toLowerCase().trim();
      if (!normalizedQuery || normalizedQuery.length < 3 || similarity) {
        try {
          // Încearcă să folosească AI pentru a extrage esența (doar dacă e necesar)
          const aiResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Extrage doar esența acestei cereri de căutare, elimină toate cuvintele de politețe și formulări: "${rawText}". Răspunde DOAR cu esența (ex: "Apartament cu 2 camere în Brașov"), fără explicații, fără punctuație finală.`,
              conversationId: `normalize-${Date.now()}`,
            }),
          });
          
          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const aiExtracted = aiData.answer?.trim();
            
            // Verifică dacă răspunsul AI este un mesaj de eroare (nu un query valid)
            const isErrorMessage = aiExtracted && (
              aiExtracted.toLowerCase().includes('nu am găsit') ||
              aiExtracted.toLowerCase().includes('nu s-au găsit') ||
              aiExtracted.toLowerCase().includes('contactezi suportul') ||
              aiExtracted.toLowerCase().includes('recomand să contactezi') ||
              aiExtracted.length > 100 // Mesajele de eroare sunt de obicei mai lungi
            );
            
            if (!isErrorMessage && aiExtracted && aiExtracted.length > 3 && aiExtracted.length < 200) {
              // Normalizează din nou răspunsul AI
              normalizedQuery = normalizeQuery(aiExtracted);
            }
          }
        } catch (err) {
          // Silent error handling
        }
      }

      if (!normalizedQuery || normalizedQuery.length < 3) {
        return;
      }

      // Marchează că procesăm
      isProcessing = true;

      // ELIMINAT: Răspuns vocal și așteptări - navigare directă pentru viteză maximă
      // Păstrăm doar scrierea instantanee (care funcționează perfect în UniversalHeader)

      // Navighează direct către pagina de search (fără întârzieri)
      const searchUrl = `/search?q=${encodeURIComponent(normalizedQuery)}`;
      window.location.href = searchUrl;
    };

    const eventHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      handleVoiceInput(customEvent);
    };

    window.addEventListener("voice-transcript-ready", eventHandler);
    
    return () => {
      window.removeEventListener("voice-transcript-ready", eventHandler);
    };
  }, [normalizeQuery]);

  // ✅ Ascultă evenimentul voice-search-complete pentru auto-search (fallback)
  useEffect(() => {
    const handleVoiceSearch = (e: CustomEvent) => {
      const searchText = e.detail.text;
      // Auto-search triggered
      
      // Doar dacă nu suntem în flux conversațional
      // (acest listener rămâne pentru compatibilitate)
    };

    const eventHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      handleVoiceSearch(customEvent);
    };

    window.addEventListener("voice-search-complete", eventHandler);
    
    return () => {
      window.removeEventListener("voice-search-complete", eventHandler);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // Redirect către pagina de search cu query
      window.location.href = `/search?q=${encodeURIComponent(query)}`;
    } else {
      performSearch(query, false);
    }
  };

  const handleVoiceTranscript = async (transcript: string) => {
    // ELIMINAT: Logica vocală din handleVoiceTranscript
    // Fluxul conversațional este gestionat complet de useEffect-ul care ascultă 'voice-transcript-ready'
    // pentru a evita dublarea vocilor
    
    setQuery(transcript);
    setShowSuggestions(false);
    
    // Căutarea se declanșează automat după confirmare în fluxul conversațional
    // Nu mai facem căutare directă aici pentru a evita dublarea
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    performSearch(suggestion, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return null;
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
    }).format(price);
  };

  const formatScore = (score: number) => {
    return `${(score * 100).toFixed(0)}%`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-2 sm:p-4">
      {/* Search Bar - Ultra Modern Design */}
      <form onSubmit={handleSubmit} className="mb-4 sm:mb-6">
        <div className="relative">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <div className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.length >= 3) {
                    setShowSuggestions(true);
                  }
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0 && query.length >= 3) {
                    setShowSuggestions(true);
                  }
                }}
                placeholder="Caută rapid... sau vorbește 🎤"
                className="w-full pl-10 sm:pl-14 pr-12 sm:pr-16 py-3 sm:py-4 md:py-5 text-base sm:text-lg md:text-xl rounded-2xl sm:rounded-3xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 sm:focus:ring-4 focus:ring-blue-400/30 focus:border-blue-500 transition-all shadow-lg sm:shadow-xl hover:shadow-xl sm:hover:shadow-2xl touch-manipulation"
                disabled={loading}
              />
              
              {/* Voice Button modern în input */}
              <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-10">
                <VoiceSearch onTranscript={handleVoiceTranscript} disabled={loading} className="w-5 h-5 sm:w-6 sm:h-6" useWhisper={true} />
              </div>
              
              {loading && (
                <div className="absolute right-10 sm:right-12 top-1/2 -translate-y-1/2 z-10">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-blue-500 border-t-transparent"></div>
                </div>
              )}
            </div>
            
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full sm:w-auto px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-2xl sm:rounded-3xl font-bold text-sm sm:text-base md:text-lg transition-all shadow-xl sm:shadow-2xl hover:shadow-blue-500/50 transform active:scale-95 sm:hover:scale-105 disabled:transform-none touch-manipulation"
            >
              <span className="flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                Caută
              </span>
            </button>
          </div>
          
          {/* Suggestions Dropdown - Ultra Modern */}
          {showSuggestions && suggestions.length > 0 && query.length >= 3 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-2 sm:mt-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-xl sm:shadow-2xl z-50 max-h-64 sm:max-h-80 md:max-h-96 overflow-y-auto backdrop-blur-xl"
            >
              <div className="p-2 sm:p-3 md:p-4">
                <div className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 sm:mb-2">
                  Sugestii Rapide
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`w-full text-left px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-4 rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-[0.98] ${
                        selectedSuggestionIndex === index
                          ? 'bg-gradient-to-r from-blue-500 to-blue-500 text-white shadow-lg scale-[1.01] sm:scale-[1.02]'
                          : 'bg-gray-50 dark:bg-gray-800 active:bg-gradient-to-r active:from-blue-50 active:to-blue-50 dark:active:from-gray-700 dark:active:to-gray-700 text-gray-900 dark:text-gray-100 active:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                        <div className={`w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                          selectedSuggestionIndex === index 
                            ? 'bg-white/20' 
                            : 'bg-blue-100 dark:bg-blue-900/30'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 sm:w-5 sm:h-5 ${
                            selectedSuggestionIndex === index ? 'text-white' : 'text-blue-600 dark:text-blue-400'
                          }`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                          </svg>
                        </div>
                        <span className="flex-1 font-semibold text-sm sm:text-base truncate">{suggestion}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 sm:w-5 sm:h-5 transition-opacity flex-shrink-0 ${
                          selectedSuggestionIndex === index 
                            ? 'text-white opacity-100' 
                            : 'text-gray-400 opacity-0 sm:group-hover:opacity-100'
                        }`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-2 sm:px-4 py-2 sm:py-3 mt-2 sm:mt-3 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 18.5 9.75c0 2.197-.765 4.218-2.045 5.818l-2.452 3.52A11.958 11.958 0 0 1 9 18.75a11.958 11.958 0 0 1-4.453-.882l-2.452 3.52A11.958 11.958 0 0 0 9 21.75c5.385 0 9.75-4.365 9.75-9.75 0-1.163-.204-2.283-.575-3.316" />
                  </svg>
                  <span className="text-xs">Apasă Enter sau click • Sugestii de la 3 caractere</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Search Meta Info */}
        {searchMeta.corrected && searchMeta.corrected !== query && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Căutare corectată: <span className="italic">"{searchMeta.corrected}"</span>
          </p>
        )}
        {searchMeta.time !== undefined && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {searchMeta.total} rezultate în {searchMeta.time}ms
          </p>
        )}
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Rezultate ({results.length})
          </h2>
          
          <div className="grid gap-4">
            {results.map((result) => (
              <div
                key={result.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {result.image && (
                    <img
                      src={result.image}
                      alt={result.title}
                      className="w-24 h-24 object-cover rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {result.title}
                        </h3>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                            {result.type === 'product' ? 'Produs' : 'Pagină'}
                          </span>
                          {result.category && (
                            <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {result.category}
                            </span>
                          )}
                          <span className="px-2 py-1 text-xs rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                            {formatScore(result.score)} relevanță
                          </span>
                        </div>
                      </div>
                      
                      {result.price && (
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {formatPrice(result.price)}
                        </div>
                      )}
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {result.description}
                    </p>
                    
                    {result.url && (
                      <a
                        href={result.url}
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        Vezi detalii →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {!loading && results.length === 0 && query && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <i className="ri-search-line text-4xl mb-4"></i>
          <p>Nu s-au găsit rezultate pentru "{query}"</p>
          <p className="text-sm mt-2">Încearcă să reformulezi întrebarea sau verifică ortografia</p>
        </div>
      )}
    </div>
  );
}

