"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import UniversalHeader from '@/components/UniversalHeader';
import { HeartIcon } from '@/components/HeroIcons';
import { supabase } from '@/lib/supabase';
import { analyzeQuery, buildSearchUrl } from '@/lib/ai/brand-detector';
import { optimizeQuery } from '@/lib/ai/fuzzy-search';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { getProductDisplayImage, isPlaceholderImage } from '@/lib/getProductDisplayImage';

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

// Helper function pentru formatare
const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatPrice = (price?: number) => {
  if (!price) return 'N/A';
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

function RezultatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [activeFilters, setActiveFilters] = useState<{
    brand?: string;
    category?: string;
    model?: string;
  }>({});
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [queryAnalysis, setQueryAnalysis] = useState<any>(null);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [visibleItems, setVisibleItems] = useState(24);

  // Fix hydration: set mounted after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load query, filters and visibleItems from URL (ca pe /ro)
  useEffect(() => {
    const urlQuery = searchParams?.get?.('q') ?? null;
    const urlBrand = searchParams?.get?.('brand') ?? null;
    const urlCategory = searchParams?.get?.('category') ?? null;
    const urlModel = searchParams?.get?.('model') ?? null;
    const urlVisible = searchParams?.get?.('visibleItems') ?? null;
    
    if (urlQuery) {
      setQuery(decodeURIComponent(urlQuery));
    }
    
    if (urlBrand || urlCategory || urlModel) {
      setActiveFilters({
        brand: urlBrand || undefined,
        category: urlCategory || undefined,
        model: urlModel || undefined,
      });
    }
    
    if (urlVisible) {
      const n = parseInt(urlVisible, 10);
      setVisibleItems(!isNaN(n) && n > 0 ? n : 24);
    } else {
      setVisibleItems(24);
    }
  }, [searchParams]);

  // Load dark mode and favorites from localStorage
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }

      // Load favorites
      const savedFavorites = localStorage.getItem('favoriteAuctions');
      if (savedFavorites) {
        try {
          const favorites = JSON.parse(savedFavorites);
          setFavoriteAuctions(favorites);
        } catch (e) {
          console.error('Error loading favorites:', e);
        }
      }
    }
  }, [mounted]);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, mounted]);

  // Persist visibleItems în URL la schimbare (ca pe /ro)
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('visibleItems', visibleItems.toString());
    window.history.replaceState({}, '', url.toString());
  }, [visibleItems, mounted]);

  // Încarcă mai multe la scroll aproape de sfârșit (ca pe /ro)
  useEffect(() => {
    if (typeof window === 'undefined' || !mounted) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        if (visibleItems >= results.length) return;
        if (window.innerHeight + window.scrollY >= document.documentElement.offsetHeight - 1000) {
          setVisibleItems((prev) => Math.min(prev + itemsPerPage, results.length));
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll as any);
  }, [visibleItems, results.length, itemsPerPage, mounted]);

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

  // Favorite functions
  const isAuctionFavorite = (auctionId: string) => {
    return favoriteAuctions.includes(auctionId);
  };

  const handleToggleFavorite = async (auctionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const isFavorite = isAuctionFavorite(auctionId);

      if (isFavorite) {
        // Remove favorite
        if (session) {
          // Remove from Supabase if logged in
          const accessToken = session.access_token;
          const response = await fetch(`/api/user/favorites?itemId=${auctionId}&itemType=auction`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const newFavorites = favoriteAuctions.filter(id => id !== auctionId);
            setFavoriteAuctions(newFavorites);
            localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
            setMessage({ type: 'success', text: 'Anunțul a fost eliminat din favorite!' });
          } else {
            throw new Error('Failed to remove favorite');
          }
        } else {
          // Remove from localStorage only (guest user)
          const newFavorites = favoriteAuctions.filter(id => id !== auctionId);
          setFavoriteAuctions(newFavorites);
          localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
          localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
          setMessage({ type: 'success', text: 'Anunțul a fost eliminat din favorite!' });
        }
      } else {
        // Add favorite
        if (session) {
          // Add to Supabase if logged in
          const accessToken = session.access_token;
          const response = await fetch('/api/user/favorites', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              itemId: auctionId,
              itemType: 'auction',
              favoriteListId: 'default-list'
            })
          });

          if (response.ok) {
            const newFavorites = [...favoriteAuctions, auctionId];
            setFavoriteAuctions(newFavorites);
            localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
            setMessage({ type: 'success', text: 'Anunțul a fost adăugat la favorite!' });
          } else {
            throw new Error('Failed to add favorite');
          }
        } else {
          // Add to localStorage only (guest user) - with timestamp for 12h expiration
          const newFavorites = [...favoriteAuctions, auctionId];
          setFavoriteAuctions(newFavorites);
          localStorage.setItem('favoriteAuctions', JSON.stringify(newFavorites));
          localStorage.setItem('favoriteAuctionsTimestamp', Date.now().toString());
          setMessage({ 
            type: 'success', 
            text: 'Anunțul a fost adăugat la favorite! Te rugăm să te autentifici în următoarele 12 ore pentru a le salva permanent.' 
          });
        }
      }
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      setMessage({ type: 'error', text: 'Eroare la actualizarea favorite-ului. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    console.log('🔍 [Rezultate] Auto-search triggered with query:', searchQuery);
    setLoading(true);
    
    // Decode query-ul dacă este URL encoded
    const decodedQuery = decodeURIComponent(searchQuery);
    setQuery(decodedQuery);
    
    // Optimizează query-ul - elimină termenii irelevanți
    const optimized = optimizeQuery(decodedQuery);
    const optimizedQuery = optimized.corrected || decodedQuery;
    
    // Elimină prefixele comune (ex: "Licitație Publică:", "ANAF:", etc.)
    let cleanedQuery = optimizedQuery
      .replace(/^licitație\s+publică\s*:?\s*/i, '')
      .replace(/^licitatie\s+publica\s*:?\s*/i, '')
      .replace(/^anaf\s*:?\s*/i, '')
      .replace(/^licitație\s+anaf\s*:?\s*/i, '')
      .replace(/^licitatie\s+anaf\s*:?\s*/i, '')
      .trim();
    
    // Elimină termenii comuni irelevanți pentru căutare
    const irrelevantTerms = [
      'licitație publică', 'licitatie publica', 'licitatie', 'publică', 'publica',
      'anaf', 'anaf:', 'licitație anaf', 'licitatie anaf',
      'oportunitate', 'oportunități', 'oportunitati',
      'cumpăr', 'vând', 'vanzare', 'vânzare',
      'pentru', 'a treia', 'a patra', 'a doua', 'prima',
    ];
    
    irrelevantTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(regex, '').trim();
    });
    
    // Elimină "Lot X" sau "Lotul X" (ex: "Lot 4", "Lotul 1")
    cleanedQuery = cleanedQuery.replace(/\b(lot|lotul)\s+\d+\b/gi, '').trim();
    
    // Elimină "A Treia Oportunitate", "A Patra Oportunitate", etc.
    cleanedQuery = cleanedQuery.replace(/\ba\s+(treia|patra|doua|prima|patra)\s+oportunitate\b/gi, '').trim();
    
    // Elimină caractere speciale redundante și normalizează
    cleanedQuery = cleanedQuery
      .replace(/^[:\-–—]\s*/, '') // Elimină ":" sau "-" de la început
      .replace(/\s*[:\-–—]\s*$/, '') // Elimină ":" sau "-" de la sfârșit
      .replace(/\s+/g, ' ') // Elimină spații multiple
      .trim();
    
    // Dacă query-ul optimizat este prea scurt, folosește cel original
    const finalQuery = cleanedQuery.length >= 3 ? cleanedQuery : decodedQuery;
    
    console.log('🔍 [Rezultate] Query optimization:', {
      original: decodedQuery,
      optimized: optimizedQuery,
      cleaned: cleanedQuery,
      final: finalQuery
    });
    
    // Analizează query-ul pentru branduri/categorii
    const analysis = analyzeQuery(finalQuery);
    setQueryAnalysis(analysis);
    
    try {
      // Încearcă mai întâi cu query-ul optimizat
      let response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          limit: 50,
          filters: {
            ...(analysis.brand && { brand: analysis.brand.brand }),
            ...(analysis.category && { category: analysis.category }),
            ...(activeFilters.brand && { brand: activeFilters.brand }),
            ...(activeFilters.category && { category: activeFilters.category }),
            ...(activeFilters.model && { model: activeFilters.model }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status} ${response.statusText}`);
      }

      let data = await response.json();
      
      // Dacă nu există rezultate cu query-ul optimizat, încearcă cu query-ul original
      if ((data.results?.length || 0) === 0 && finalQuery !== decodedQuery) {
        console.log('🔍 [Rezultate] No results with optimized query, trying original...');
        const originalResponse = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: decodedQuery,
            limit: 50,
            filters: {
              ...(analysis.brand && { brand: analysis.brand.brand }),
              ...(analysis.category && { category: analysis.category }),
              ...(activeFilters.brand && { brand: activeFilters.brand }),
              ...(activeFilters.category && { category: activeFilters.category }),
              ...(activeFilters.model && { model: activeFilters.model }),
            },
          }),
        });
        
        if (originalResponse.ok) {
          const originalData = await originalResponse.json();
          // Folosește rezultatele originale dacă sunt mai bune
          if ((originalData.results?.length || 0) > 0) {
            data = originalData;
          }
        }
      }
      
      console.log('🔍 [Rezultate] Search API response:', {
        resultsCount: data.results?.length || 0,
        hasSuggestions: data.hasSuggestions,
        query: decodedQuery,
        finalQuery: finalQuery,
        suggestionsCount: data.suggestions?.length || 0,
        rawData: data
      });
      
      // Transformă rezultatele - acceptă atât formatul direct cât și formatul cu metadata
      // Include și sugestiile dacă există și nu sunt rezultate directe
      const resultsToTransform = data.results && data.results.length > 0 
        ? data.results 
        : (data.suggestions || []);
      
      const transformedResults: SearchResult[] = resultsToTransform.map((result: any, index: number) => {
        const id = result.id || result.metadata?.id || '';
        const title = result.title || result.metadata?.title || (result.text ? result.text.substring(0, 100) : '') || 'Fără titlu';
        const description = result.description || result.metadata?.description || result.text || '';
        const category = result.category || result.metadata?.category || result.metadata?.subcategory;
        const price = result.price || result.metadata?.price || result.starting_price_ron;
        const image = result.image || result.metadata?.image || (Array.isArray(result.images) && result.images[0] ? (typeof result.images[0] === 'string' ? result.images[0] : result.images[0]?.url) : undefined);
        const url = result.url || result.metadata?.url || result.source || (result.slug ? `/licitatii-publice/${result.slug}` : result.id ? `/licitatii-publice/${result.id}` : '');
        const score = result.score || 0;
        const type = result.type || 'product';
        const brand = result.brand || result.metadata?.brand;
        
        if (index < 3) {
          console.log(`🔍 [Rezultate] Result ${index}:`, {
            id,
            title: title.substring(0, 50),
            hasImage: !!image,
            hasUrl: !!url,
            rawResult: result
          });
        }
        
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
          console.warn('🔍 [Rezultate] Filtered out invalid result:', { id: r.id, title: r.title });
        }
        return isValid;
      });
      
      console.log('🔍 [Rezultate] Transformed results:', {
        count: transformedResults.length,
        sample: transformedResults.slice(0, 2) // Primele 2 pentru debug
      });
      
      setResults(transformedResults);
      
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
      console.error('🔍 [Rezultate] Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  // Auto-search când se încarcă pagina sau se schimbă query-ul/filtrele din URL
  useEffect(() => {
    if (!mounted) return;
    
    const urlQuery = searchParams?.get?.('q') ?? null;
    const urlBrand = searchParams?.get?.('brand') ?? null;
    const urlCategory = searchParams?.get?.('category') ?? null;
    const urlModel = searchParams?.get?.('model') ?? null;
    
    // Actualizează filtrele din URL
    const newFilters = {
      brand: urlBrand || undefined,
      category: urlCategory || undefined,
      model: urlModel || undefined,
    };
    setActiveFilters(newFilters);
    
    if (urlQuery && urlQuery.trim()) {
      const decodedQuery = decodeURIComponent(urlQuery);
      console.log('🔍 [Rezultate] Auto-search triggered with query:', decodedQuery, 'filters:', newFilters);
      setQuery(decodedQuery);
      
      // Apelează performSearch direct cu filtrele din URL
      (async () => {
        setLoading(true);
        try {
          // Optimizează query-ul - elimină termenii irelevanți
          const optimized = optimizeQuery(decodedQuery);
          const optimizedQuery = optimized.corrected || decodedQuery;
          
          // Elimină prefixele comune (ex: "Licitație Publică:", "ANAF:", etc.)
          let cleanedQuery = optimizedQuery
            .replace(/^licitație\s+publică\s*:?\s*/i, '')
            .replace(/^licitatie\s+publica\s*:?\s*/i, '')
            .replace(/^anaf\s*:?\s*/i, '')
            .replace(/^licitație\s+anaf\s*:?\s*/i, '')
            .replace(/^licitatie\s+anaf\s*:?\s*/i, '')
            .trim();
          
          // Elimină termenii comuni irelevanți pentru căutare
          const irrelevantTerms = [
            'licitație publică', 'licitatie publica', 'licitatie', 'publică', 'publica',
            'anaf', 'anaf:', 'licitație anaf', 'licitatie anaf',
            'oportunitate', 'oportunități', 'oportunitati',
            'cumpăr', 'vând', 'vanzare', 'vânzare',
            'pentru', 'a treia', 'a patra', 'a doua', 'prima',
            'oportunitate', 'oportunitati',
          ];
          
          irrelevantTerms.forEach(term => {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            cleanedQuery = cleanedQuery.replace(regex, '').trim();
          });
          
          // Elimină "Lot X" sau "Lotul X" (ex: "Lot 4", "Lotul 1")
          cleanedQuery = cleanedQuery.replace(/\b(lot|lotul)\s+\d+\b/gi, '').trim();
          
          // Elimină "A Treia Oportunitate", "A Patra Oportunitate", etc.
          cleanedQuery = cleanedQuery.replace(/\ba\s+(treia|patra|doua|prima|patra)\s+oportunitate\b/gi, '').trim();
          
          // Elimină caractere speciale redundante și normalizează
          cleanedQuery = cleanedQuery
            .replace(/^[:\-–—]\s*/, '') // Elimină ":" sau "-" de la început
            .replace(/\s*[:\-–—]\s*$/, '') // Elimină ":" sau "-" de la sfârșit
            .replace(/\s+/g, ' ') // Elimină spații multiple
            .trim();
          
          // Dacă query-ul optimizat este prea scurt, folosește cel original
          const finalQuery = cleanedQuery.length >= 3 ? cleanedQuery : decodedQuery;
          
          console.log('🔍 [Rezultate] Query optimization:', {
            original: decodedQuery,
            optimized: optimizedQuery,
            cleaned: cleanedQuery,
            final: finalQuery
          });
          
          const analysis = analyzeQuery(finalQuery);
          setQueryAnalysis(analysis);
          
          // Încearcă mai întâi cu query-ul optimizat
          let response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: finalQuery,
              limit: 50,
              filters: {
                ...(analysis.brand && { brand: analysis.brand.brand }),
                ...(analysis.category && { category: analysis.category }),
                ...(newFilters.brand && { brand: newFilters.brand }),
                ...(newFilters.category && { category: newFilters.category }),
                ...(newFilters.model && { model: newFilters.model }),
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Search API error: ${response.status} ${response.statusText}`);
          }

          let data = await response.json();
          
          // Dacă nu există rezultate cu query-ul optimizat, încearcă cu query-ul original
          if ((data.results?.length || 0) === 0 && finalQuery !== decodedQuery) {
            console.log('🔍 [Rezultate] No results with optimized query, trying original...');
            const originalResponse = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: decodedQuery,
                limit: 50,
                filters: {
                  ...(analysis.brand && { brand: analysis.brand.brand }),
                  ...(analysis.category && { category: analysis.category }),
                  ...(newFilters.brand && { brand: newFilters.brand }),
                  ...(newFilters.category && { category: newFilters.category }),
                  ...(newFilters.model && { model: newFilters.model }),
                },
              }),
            });
            
            if (originalResponse.ok) {
              const originalData = await originalResponse.json();
              // Folosește rezultatele originale dacă sunt mai bune
              if ((originalData.results?.length || 0) > 0) {
                data = originalData;
              }
            }
          }
          
          console.log('🔍 [Rezultate] Search API response:', {
            resultsCount: data.results?.length || 0,
            hasSuggestions: data.hasSuggestions,
            query: decodedQuery,
            finalQuery: finalQuery,
            suggestionsCount: data.suggestions?.length || 0,
            rawData: data
          });
          
          // Transformă rezultatele - include și sugestiile dacă există
          const resultsToTransform = data.results && data.results.length > 0 
            ? data.results 
            : (data.suggestions || []);
          
          const transformedResults: SearchResult[] = resultsToTransform.map((result: any, index: number) => {
            const id = result.id || result.metadata?.id || '';
            const title = result.title || result.metadata?.title || (result.text ? result.text.substring(0, 100) : '') || 'Fără titlu';
            const description = result.description || result.metadata?.description || result.text || '';
            const category = result.category || result.metadata?.category || result.metadata?.subcategory;
            const price = result.price || result.metadata?.price || result.starting_price_ron;
            const image = result.image || result.metadata?.image || (Array.isArray(result.images) && result.images[0] ? (typeof result.images[0] === 'string' ? result.images[0] : result.images[0]?.url) : undefined);
            const url = result.url || result.metadata?.url || result.source || (result.slug ? `/licitatii-publice/${result.slug}` : result.id ? `/licitatii-publice/${result.id}` : '');
            const score = result.score || 0;
            const type = result.type || 'product';
            const brand = result.brand || result.metadata?.brand;
            
            if (index < 3) {
              console.log(`🔍 [Rezultate] Result ${index}:`, {
                id,
                title: title.substring(0, 50),
                hasImage: !!image,
                hasUrl: !!url,
                rawResult: result
              });
            }
            
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
            const isValid = r.id && r.title && r.title.trim() !== '' && r.title !== 'Fără titlu';
            if (!isValid) {
              console.warn('🔍 [Rezultate] Filtered out invalid result:', { id: r.id, title: r.title });
            }
            return isValid;
          });
          
          console.log('🔍 [Rezultate] Transformed results:', {
            count: transformedResults.length,
            sample: transformedResults.slice(0, 2)
          });
          
          setResults(transformedResults);
          
          // Generează sugestii
          const categories = new Set<string>();
          const brands = new Set<string>();
          
          transformedResults.forEach((r: SearchResult) => {
            if (r.category) categories.add(r.category);
            if (r.brand) brands.add(r.brand);
          });
          
          setCategorySuggestions(Array.from(categories).slice(0, 10));
          setBrandSuggestions(Array.from(brands).slice(0, 10));
        } catch (error) {
          console.error('🔍 [Rezultate] Search error:', error);
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setResults([]);
      setQuery('');
    }
  }, [searchParams, mounted]);

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
    
    // Re-face search cu filtrele noi (rămâne pe /rezultate)
    const searchUrl = buildSearchUrl(query || '', newFilters, '/rezultate');
    router.push(searchUrl);
  };

  const handleSmartSuggestion = (suggestion: string, type: 'specific' | 'all-brand') => {
    if (queryAnalysis?.brand) {
      if (type === 'specific') {
        router.push(buildSearchUrl(query, {
          brand: queryAnalysis.brand.brand,
          model: queryAnalysis.model,
        }, '/rezultate'));
      } else {
        router.push(buildSearchUrl(queryAnalysis.brand.fullBrand, {
          brand: queryAnalysis.brand.brand,
        }, '/rezultate'));
      }
    }
  };

  // Paginare la fel ca pe /ro: primele visibleItems rezultate
  const displayedResults = results.slice(0, visibleItems);
  const hasMore = visibleItems < results.length;

  if (!mounted) {
    return null;
  }

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gray-900' 
        : 'bg-white'
    }`} suppressHydrationWarning>
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Main Content - la fel ca /ro: fără buton Înapoi, fundal alb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message Notification */}
        {message.text && (
          <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            message.type === 'success' 
              ? 'bg-green-500 text-white' 
              : message.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-blue-500 text-white'
          }`}>
            {message.text}
          </div>
        )}

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
                  router.push(buildSearchUrl(query, activeFilters, '/ro'));
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

        {/* View Mode Selector */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <div className={`relative inline-flex rounded-xl p-1 transition-colors ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <button
                onClick={() => setViewMode('grid')}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  viewMode === 'grid'
                    ? isDarkMode
                      ? 'bg-white text-gray-900 shadow-lg'
                      : 'bg-white text-gray-900 shadow-md'
                    : isDarkMode
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span>Grid</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  viewMode === 'list'
                    ? isDarkMode
                      ? 'bg-white text-gray-900 shadow-lg'
                      : 'bg-white text-gray-900 shadow-md'
                    : isDarkMode
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Listă</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
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

        {/* Results Count */}
        {!loading && results.length > 0 && (
          <div className={`mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <p className="text-sm">
              {results.length} {results.length === 1 ? 'rezultat găsit' : 'rezultate găsite'}
            </p>
          </div>
        )}

        {/* Results Grid/List - la fel ca /ro, cu visibleItems */}
        {!loading && results.length > 0 && (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6' : 'space-y-4'}>
            {displayedResults.map((result) => (
              <div
                key={result.id}
                className={`border rounded-lg overflow-hidden transition-all duration-300 hover:shadow-xl ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}
              >
                {viewMode === 'list' ? (
                  /* List View - Storia.ro Style */
                  <div className="flex flex-col lg:flex-row">
                    {/* Image Section - Left */}
                    <div className="lg:w-[40%] relative">
                      {(() => {
                        const displayImage = getProductDisplayImage(result);
                        const hasImage = displayImage && !isPlaceholderImage(displayImage);
                        return hasImage ? (
                        <div 
                          className={`relative aspect-square lg:aspect-auto lg:h-full cursor-pointer ${
                            isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                          }`}
                          onClick={() => result.url && (window.location.href = result.url)}
                        >
                          <img
                            src={displayImage}
                            alt={result.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                            }}
                          />
                          {/* Favorite Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(result.id);
                            }}
                            className={`absolute top-3 right-3 p-2 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl ${
                              isAuctionFavorite(result.id)
                                ? 'bg-red-600 text-white'
                                : isDarkMode
                                  ? 'bg-white/20 backdrop-blur-sm text-gray-300 hover:bg-white/30'
                                  : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white'
                            }`}
                            title={isAuctionFavorite(result.id) ? 'Elimină din favorite' : 'Adaugă la favorite'}
                          >
                            <HeartIcon 
                              className={`w-5 h-5 ${isAuctionFavorite(result.id) ? 'text-white fill-white' : 'text-red-500'}`} 
                              strokeWidth={1.5} 
                            />
                          </button>
                        </div>
                      ) : (
                        <div className={`aspect-square lg:aspect-auto lg:h-full flex items-center justify-center ${
                          isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                        }`}>
                          <svg className={`w-16 h-16 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      );
                      })()}
                    </div>

                    {/* Details Section - Right */}
                    <div className="lg:w-[60%] p-4 lg:p-6 flex flex-col justify-between">
                      <div>
                        {/* Title */}
                        <h3 
                          className={`text-lg md:text-xl font-normal leading-tight mb-3 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}
                          onClick={() => result.url && (window.location.href = result.url)}
                        >
                          {result.title}
                        </h3>

                        {/* Category & Brand Badges */}
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          {result.category && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              isDarkMode ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500 text-white'
                            }`}>
                              {result.category}
                            </span>
                          )}
                          {result.brand && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              isDarkMode ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500 text-white'
                            }`}>
                              {result.brand}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        <p className={`text-sm mb-4 line-clamp-2 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {result.description}
                        </p>
                      </div>

                      {/* Price & Action */}
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div>
                          {result.price ? (
                            <>
                              <div className={`text-2xl font-bold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {formatPrice(result.price)}
                              </div>
                              {result.category && (
                                <div className={`text-xs ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                  {result.category}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className={`text-sm ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              Preț la cerere
                            </div>
                          )}
                        </div>
                        {result.url && (
                          <button 
                            onClick={() => window.location.href = result.url!}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                              isDarkMode
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            Vezi detalii
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Grid View - Original Design */
                  <>
                    {/* Image */}
                    <div 
                      className="relative bg-cover bg-center h-32 md:h-48"
                      style={{backgroundImage: `url(${getProductDisplayImage(result)})`}}
                    >
                      {/* Favorite Button */}
                      <div className="absolute top-2 right-2 md:top-4 md:right-4">
                        <button
                          onClick={() => handleToggleFavorite(result.id)}
                          className={`p-1.5 md:p-2 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                            isAuctionFavorite(result.id)
                              ? 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600'
                              : isDarkMode
                                ? 'bg-white/20 backdrop-blur-sm text-gray-300 hover:bg-white/30'
                                : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white'
                          }`}
                          title={isAuctionFavorite(result.id) ? 'Elimină din favorite' : 'Adaugă la favorite'}
                        >
                          <HeartIcon 
                            className={`w-5 h-5 ${isAuctionFavorite(result.id) ? 'text-white fill-white' : 'text-red-500 drop-shadow-lg'}`} 
                            strokeWidth={1.5} 
                          />
                        </button>
                      </div>
                      
                      {/* Price Badge */}
                      {result.price && (
                        <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4">
                          <div className="text-white drop-shadow-lg">
                            <div className="text-xs md:text-sm font-medium">Preț</div>
                            <div className="text-sm md:text-lg font-bold">
                              {formatNumber(Math.round(result.price))} Lei
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
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Toate rezultatele încărcate - ca pe /ro */}
        {!loading && !hasMore && results.length > 0 && (
          <div className="mt-8 text-center">
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <i className="ri-check-line mr-2"></i>
              Toate rezultatele au fost încărcate
            </p>
          </div>
        )}

        {/* No Results */}
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

        {/* Empty State - No Query */}
        {!loading && results.length === 0 && !query && (
          <div className="text-center py-8 sm:py-12 md:py-16 px-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-400'
            }`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <p className={`text-base sm:text-lg md:text-xl mb-2 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Nu există căutare activă
            </p>
            <p className={`text-xs sm:text-sm transition-colors duration-300 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            }`}>
              Folosește bara de căutare pentru a găsi produse
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RezultatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <RezultatePageContent />
    </Suspense>
  );
}
