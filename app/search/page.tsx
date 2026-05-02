"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import UniversalHeader from '@/components/UniversalHeader';
import { BackButton } from '@/components/ui/back-button';
import { analyzeQuery, buildSearchUrl } from '@/lib/ai/brand-detector';
import { HeartIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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
  brand?: string;
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    brand?: string;
    category?: string;
    model?: string;
  }>({});
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [queryAnalysis, setQueryAnalysis] = useState<any>(null);

  // Fix hydration: set mounted after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load query from URL
  useEffect(() => {
    const urlQuery = searchParams?.get?.('q') ?? null;
    const urlBrand = searchParams?.get?.('brand') ?? null;
    const urlCategory = searchParams?.get?.('category') ?? null;
    const urlModel = searchParams?.get?.('model') ?? null;
    
    if (urlQuery) {
      setQuery(urlQuery);
    }
    
    if (urlBrand || urlCategory || urlModel) {
      setActiveFilters({
        brand: urlBrand || undefined,
        category: urlCategory || undefined,
        model: urlModel || undefined,
      });
    }
  }, [searchParams]);

  // Load dark mode from localStorage (sincronizat cu homepage)
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, [mounted]);

  // Apply dark mode class to HTML element (identic cu homepage)
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    
    // Decode query-ul dacă este URL encoded
    const decodedQuery = decodeURIComponent(searchQuery);
    setQuery(decodedQuery);
    
    // Analizează query-ul pentru branduri/categorii
    const analysis = analyzeQuery(decodedQuery);
    setQueryAnalysis(analysis);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: decodedQuery,
          limit: 50,
          filters: {
            ...(analysis.brand && { brand: analysis.brand.brand }),
            ...(analysis.category && { category: analysis.category }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      console.log('Search API response:', { 
        resultsCount: data.results?.length || 0, 
        hasSuggestions: data.hasSuggestions,
        query: decodedQuery,
        rawData: data
      });
      
      // Transformă rezultatele în formatul corect - acceptă atât formatul direct cât și formatul cu metadata
      const transformedResults: SearchResult[] = (data.results || []).map((result: any, index: number) => {
        // Verifică mai multe formate posibile
        const id = result.id || result.metadata?.id || `temp-${index}`;
        const title = result.title || result.metadata?.title || (result.text ? result.text.substring(0, 100) : '') || 'Fără titlu';
        const description = result.description || result.metadata?.description || result.text || '';
        const category = result.category || result.metadata?.category || result.metadata?.subcategory;
        const price = result.price || result.metadata?.price || result.starting_price_ron;
        const image = result.image || result.metadata?.image || (Array.isArray(result.images) && result.images[0] ? (typeof result.images[0] === 'string' ? result.images[0] : result.images[0]?.url) : undefined);
        const url = result.url || result.metadata?.url || result.source || (result.slug ? `/licitatii-publice/${result.slug}` : result.id ? `/licitatii-publice/${result.id}` : '');
        const score = result.score || 0;
        const type = result.type || 'product';
        const brand = result.brand || result.metadata?.brand;
        
        console.log(`Result ${index}:`, { id, title: title.substring(0, 50), hasMetadata: !!result.metadata, hasText: !!result.text });
        
        return {
          id,
          title,
          description,
          category,
          price,
          image,
          url,
          score,
          type,
          brand,
        };
      }).filter((r: SearchResult) => {
        // Filtrează doar rezultatele complet invalide (fără id și fără title)
        const isValid = r.id && r.title && r.title.trim() !== '' && r.title !== 'Fără titlu';
        if (!isValid) {
          console.warn('Filtered out invalid result:', { id: r.id, title: r.title });
        }
        return isValid;
      });
      
      console.log('Transformed results:', { 
        count: transformedResults.length,
        sample: transformedResults.slice(0, 2), // Primele 2 pentru debug
        hasSuggestions: data.hasSuggestions,
        rawResultsCount: data.results?.length || 0
      });
      
      // Dacă nu există rezultate dar există sugestii, afișează-le ca rezultate
      if (transformedResults.length === 0 && data.hasSuggestions && data.results && data.results.length > 0) {
        console.log('No transformed results but has suggestions, showing suggestions as results');
        // Sugestiile sunt deja în data.results, dar nu au trecut transformarea
        // Încearcă să le transforme din nou fără filtru strict
        const suggestionResults: SearchResult[] = (data.results || []).map((result: any, index: number) => ({
          id: result.id || `suggestion-${index}`,
          title: result.title || result.metadata?.title || (result.text ? result.text.substring(0, 100) : '') || 'Produs sugerat',
          description: result.description || result.metadata?.description || result.text || '',
          category: result.category || result.metadata?.category || result.metadata?.subcategory,
          price: result.price || result.metadata?.price || result.starting_price_ron,
          image: result.image || result.metadata?.image,
          url: result.url || result.metadata?.url || result.source,
          score: result.score || 0.5,
          type: result.type || 'product',
          brand: result.brand || result.metadata?.brand,
        }));
        setResults(suggestionResults);
      } else {
        setResults(transformedResults);
      }
      
      // Generează sugestii de categorii și branduri din rezultate
      const categories = new Set<string>();
      const brands = new Set<string>();
      
      transformedResults.forEach((r: SearchResult) => {
        if (r.category) categories.add(r.category);
        if (r.brand) brands.add(r.brand);
      });
      
      setCategorySuggestions(Array.from(categories).slice(0, 10));
      setBrandSuggestions(Array.from(brands).slice(0, 10));
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search dacă există query în URL
  useEffect(() => {
    if (!mounted) return;
    
    const urlQuery = searchParams?.get?.('q') ?? null;
    if (urlQuery && urlQuery.trim()) {
      // Decodează query-ul din URL
      const decodedQuery = decodeURIComponent(urlQuery);
      console.log('Auto-search triggered with query:', decodedQuery);
      performSearch(decodedQuery).catch(err => {
        console.error('Error in performSearch:', err);
      });
    } else {
      setResults([]);
      setQuery('');
    }
  }, [searchParams, performSearch, mounted]);

  const handleFilterClick = (type: 'brand' | 'category' | 'model', value: string) => {
    const newFilters = { ...activeFilters };
    
    if (type === 'brand') {
      newFilters.brand = newFilters.brand === value ? undefined : value;
    } else if (type === 'category') {
      newFilters.category = newFilters.category === value ? undefined : value;
    } else if (type === 'model') {
      newFilters.model = newFilters.model === value ? undefined : value;
    }
    
    setActiveFilters(newFilters);
    
    // Re-face search cu filtrele noi
    const searchUrl = buildSearchUrl(query || '', newFilters);
    router.push(searchUrl);
  };

  const handleSmartSuggestion = (suggestion: string, type: 'specific' | 'all-brand') => {
    if (queryAnalysis?.brand) {
      if (type === 'specific') {
        // Caută modelul specific
        router.push(buildSearchUrl(query, {
          brand: queryAnalysis.brand.brand,
          model: queryAnalysis.model,
        }));
      } else {
        // Caută tot brand-ul
        router.push(buildSearchUrl(queryAnalysis.brand.fullBrand, {
          brand: queryAnalysis.brand.brand,
        }));
      }
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return null;
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
    }).format(price);
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <UniversalHeader
          isDarkMode={true}
          onToggleDarkMode={() => {}}
        />
        <main className="container mx-auto py-8 px-4">
          <div className="mb-6">
            <BackButton fallbackHref="/dashboard" label="Înapoi" />
          </div>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Se încarcă...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
    }`} suppressHydrationWarning>
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      
      <main className="container mx-auto pt-20 sm:pt-24 md:pt-28 pb-4 sm:pb-6 md:pb-8 px-3 sm:px-4 md:px-6">
        <div className="mb-4 sm:mb-6 flex justify-center sm:justify-start">
          <BackButton fallbackHref="/dashboard" label="Înapoi" />
        </div>
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6 md:mb-8">
          <h1 className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 ${
            isDarkMode 
              ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
              : 'bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent'
          }`}>
            Căutare Rapidă
          </h1>
          <p className={`text-sm sm:text-base transition-colors duration-300 ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            Găsește exact ce cauți cu sugestii inteligente
          </p>
        </div>
        
        {/* Search Input */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <div className="relative max-w-4xl mx-auto">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) {
                  const searchUrl = `/search?q=${encodeURIComponent(query)}`;
                  router.push(searchUrl);
                }
              }}
              className="relative"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Caută rapid..." 
                  autoComplete="off"
                  className={`w-full pl-12 pr-24 py-4 rounded-2xl border-2 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all shadow-lg hover:shadow-xl text-lg ${
                    isDarkMode
                      ? 'border-white/20 bg-white/15 text-white placeholder-gray-300 hover:bg-white/20'
                      : 'border-gray-300/50 bg-gray-50/90 text-gray-900 placeholder-gray-500 hover:bg-gray-100/90'
                  }`}
                />
                
                {/* Search Button */}
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                  Caută
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Smart Suggestions pentru Brand + Model */}
        {queryAnalysis?.suggestion === 'brand-model' && queryAnalysis.brand && queryAnalysis.model && (
          <div className={`mb-4 sm:mb-6 p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-300 ${
            isDarkMode 
              ? 'bg-gradient-to-r from-blue-900/20 to-blue-900/20 border-blue-800' 
              : 'bg-gradient-to-r from-blue-50 to-blue-50 border-blue-200'
          }`}>
            <p className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            }`}>
              Ce vrei să vezi?
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => handleSmartSuggestion(query, 'specific')}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95 sm:hover:scale-105"
              >
                {queryAnalysis.brand.fullBrand} {queryAnalysis.model} (Specific)
              </button>
              <button
                onClick={() => handleSmartSuggestion(query, 'all-brand')}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95 sm:hover:scale-105"
              >
                Toate produsele {queryAnalysis.brand.fullBrand}
              </button>
            </div>
          </div>
        )}

        {/* Active Filters */}
        {(activeFilters.brand || activeFilters.category || activeFilters.model) && (
          <div className="mb-4 sm:mb-6 flex flex-wrap gap-2">
            <span className={`text-xs sm:text-sm font-semibold py-2 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Filtre active:
            </span>
            {activeFilters.brand && (
              <button
                onClick={() => handleFilterClick('brand', activeFilters.brand!)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors touch-manipulation"
              >
                Marca: {activeFilters.brand} ×
              </button>
            )}
            {activeFilters.category && (
              <button
                onClick={() => handleFilterClick('category', activeFilters.category!)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors touch-manipulation"
              >
                Categorie: {activeFilters.category} ×
              </button>
            )}
            {activeFilters.model && (
              <button
                onClick={() => handleFilterClick('model', activeFilters.model!)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-green-600 active:bg-green-700 transition-colors touch-manipulation"
              >
                Model: {activeFilters.model} ×
              </button>
            )}
          </div>
        )}

        {/* Category & Brand Suggestions */}
        {(categorySuggestions.length > 0 || brandSuggestions.length > 0) && (
          <div className="mb-4 sm:mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {categorySuggestions.length > 0 && (
              <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/10 backdrop-blur-lg border-white/20' 
                  : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-100' : 'text-gray-900'
                }`}>
                  Categorii Relevante
                </h3>
                <div className="flex flex-wrap gap-2">
                  {categorySuggestions.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleFilterClick('category', cat)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all touch-manipulation active:scale-95 ${
                        activeFilters.category === cat
                          ? 'bg-blue-500 text-white'
                          : isDarkMode
                            ? 'bg-gray-700 text-gray-300 active:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {brandSuggestions.length > 0 && (
              <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/10 backdrop-blur-lg border-white/20' 
                  : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-100' : 'text-gray-900'
                }`}>
                  Branduri Disponibile
                </h3>
                <div className="flex flex-wrap gap-2">
                  {brandSuggestions.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => handleFilterClick('brand', brand)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all touch-manipulation active:scale-95 ${
                        activeFilters.brand === brand
                          ? 'bg-blue-500 text-white'
                          : isDarkMode
                            ? 'bg-gray-700 text-gray-300 active:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {/* Debug info - remove after testing */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900 rounded">
            <p className="text-xs">Debug: loading={loading.toString()}, results={results.length}, query={query || 'empty'}</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-8 sm:py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className={`mt-4 text-sm sm:text-base transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Caută...
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            {/* Results Count */}
            <div className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <p className="text-sm">
                {results.length} {results.length === 1 ? 'rezultat găsit' : 'rezultate găsite'}
                {query && ` pentru "${query}"`}
              </p>
            </div>

            {/* Results Grid - Design similar cu /ro */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
              {results.map((result) => (
                <div
                  key={result.id}
                  className={`backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 border hover:shadow-3xl hover:scale-105 ${
                    isDarkMode 
                      ? 'bg-white/10 border-white/20' 
                      : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Image */}
                  <div 
                    className="relative h-32 md:h-48 bg-cover bg-center"
                    style={{backgroundImage: `url(${result.image || '/no-image-placeholder.svg'})`}}
                  >
                    {/* Favorite Button */}
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 flex space-x-1 md:space-x-2">
                      <button
                        className={`p-1.5 md:p-2 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 bg-white/20 backdrop-blur-sm text-gray-300 hover:bg-white/30`}
                        title="Adaugă la favorite"
                      >
                        <HeartIcon className="w-6 h-6 text-red-500 drop-shadow-lg" strokeWidth={1.5} />
                      </button>
                    </div>
                    
                    {/* Price Badge */}
                    {result.price && (
                      <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4">
                        <div className="text-white">
                          <div className="text-xs md:text-sm font-medium">Preț</div>
                          <div className="text-sm md:text-lg font-bold">
                            {new Intl.NumberFormat('ro-RO', {
                              style: 'currency',
                              currency: 'RON',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            }).format(result.price)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-3 md:p-6">
                    <div className="mb-1 md:mb-2">
                      <h3 
                        className={`text-sm md:text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate cursor-pointer hover:text-blue-600`} 
                        title={result.title}
                        onClick={() => result.url && (window.location.href = result.url)}
                      >
                        {result.title}
                      </h3>
                      
                      {/* Category and Brand Badges */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {result.category && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isDarkMode
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {result.category}
                          </span>
                        )}
                        {result.brand && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isDarkMode
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {result.brand}
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          isDarkMode
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : 'bg-green-100 text-green-700 border border-green-200'
                        }`}>
                          {result.type === 'product' ? 'Produs' : 'Pagină'}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-3">
                      <p className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} line-clamp-3`}>
                        {result.description}
                      </p>
                      
                      {/* View Details Button */}
                      {result.url && (
                        <div className="pt-2">
                          <button 
                            onClick={() => window.location.href = result.url!}
                            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-2 md:py-3 rounded-lg text-sm md:text-base font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            Vezi Detalii
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="text-center py-8 sm:py-12 md:py-16 px-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-400'
            }`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <p className={`text-base sm:text-lg md:text-xl mb-2 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Nu s-au găsit rezultate pentru "{query}"
            </p>
            <p className={`text-xs sm:text-sm transition-colors duration-300 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            }`}>
              Încearcă să reformulezi sau verifică filtrele
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <UniversalHeader
          isDarkMode={true}
          onToggleDarkMode={() => {}}
        />
        <main className="container mx-auto py-8 px-4">
          <div className="mb-6">
            <BackButton fallbackHref="/dashboard" label="Înapoi" />
          </div>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-400">Se încarcă...</p>
          </div>
        </main>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
