"use client";

/**
 * Pagină Publică - Licitații ANAF
 * Afișează toate licitațiile ANAF cu filtre și căutare
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import UniversalHeader from '@/components/UniversalHeader';

interface Licitatie {
  id: string;
  numar_licitatie: string | null;
  data_licitatie: string | null;
  ora_licitatie: string | null;
  loc_licitatie: string | null;
  tip_bun: string | null;
  categoria_teren: string | null;
  suprafata_totala: number | null;
  unitate_suprafata: string | null;
  judet: string;
  localitate: string;
  adresa: string | null;
  lat: number | null;
  lng: number | null;
  street_view_image_url: string | null;
  nume_contribuabil: string | null;
  pret_evaluare: number | null;
  tva_inclus: boolean;
  valoare_tva: number | null;
  moneda: string;
  conditii_suplimentare: any;
  detalii_relevante: string | null;
  pdf_url: string | null;
  status: string;
  product_id: string | null;
  created_at: string;
}

function LicitatiiPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [licitatii, setLicitatii] = useState<Licitatie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [judete, setJudete] = useState<string[]>([]);
  const [tipuriBunuri, setTipuriBunuri] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Filtre
  const [filterJudet, setFilterJudet] = useState<string>(searchParams.get('judet') || 'all');
  const [filterTipBun, setFilterTipBun] = useState<string>(searchParams.get('tip_bun') || 'all');
  const [filterDataFrom, setFilterDataFrom] = useState<string>('');
  const [filterDataTo, setFilterDataTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dark mode management
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.document.documentElement.classList.toggle('dark', isDarkMode);
      window.localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  useEffect(() => {
    loadLicitatii();
  }, [filterJudet, filterTipBun, filterDataFrom, filterDataTo]);

  const loadLicitatii = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterJudet !== 'all') params.append('judet', filterJudet);
      if (filterTipBun !== 'all') params.append('tip_bun', filterTipBun);
      if (filterDataFrom) params.append('data_licitatie_from', filterDataFrom);
      if (filterDataTo) params.append('data_licitatie_to', filterDataTo);

      const response = await fetch(`/api/anaf/licitatii?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();

      if (result.success) {
        const data = result.data || [];
        setLicitatii(data);
        
        // Extrage județe și tipuri unice
        const uniqueJudete = Array.from(new Set(data.map((l: Licitatie) => l.judet))).sort() as string[];
        const uniqueTipuri = Array.from(new Set(data.map((l: Licitatie) => l.tip_bun).filter(Boolean))).sort() as string[];
        
        setJudete(uniqueJudete);
        setTipuriBunuri(uniqueTipuri);
      } else {
        console.error('API returned error:', result.error);
        setLicitatii([]);
      }
    } catch (error: any) {
      console.error('Error loading licitatii:', error);
      setLicitatii([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLicitatii = licitatii.filter((licitatie) => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        licitatie.localitate?.toLowerCase().includes(searchLower) ||
        licitatie.judet?.toLowerCase().includes(searchLower) ||
        licitatie.adresa?.toLowerCase().includes(searchLower) ||
        licitatie.tip_bun?.toLowerCase().includes(searchLower) ||
        licitatie.nume_contribuabil?.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }
    return true;
  });

  const formatPrice = (price: number | null, currency: string = 'RON') => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency === 'EUR' ? 'EUR' : 'RON',
    }).format(price);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('ro-RO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    }`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode}/>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-blue-600 mb-4 shadow-lg">
            <i className="ri-hammer-line text-white text-3xl"></i>
          </div>
          <h1 className={`text-4xl md:text-5xl font-bold mb-3 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Licitații ANAF
          </h1>
          <p className={`text-lg ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            Licitații publice ANAF disponibile pentru participare
          </p>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl shadow-xl backdrop-blur-lg border mb-6 p-6 ${
          isDarkMode 
            ? 'bg-white/10 border-white/20' 
            : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
            }`}>
              <i className="ri-filter-3-line text-blue-600 text-xl"></i>
            </div>
            <h2 className={`text-xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Filtre
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-search-line mr-2"></i>
                Căutare
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Caută după locație, tip bun..."
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    isDarkMode 
                      ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-map-pin-line mr-2"></i>
                Județ
              </label>
              <select
                value={filterJudet}
                onChange={(e) => setFilterJudet(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">Toate județele</option>
                {judete.map((judet) => (
                  <option key={judet} value={judet}>
                    {judet}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-folder-line mr-2"></i>
                Tip Bun
              </label>
              <select
                value={filterTipBun}
                onChange={(e) => setFilterTipBun(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">Toate tipurile</option>
                {tipuriBunuri.map((tip) => (
                  <option key={tip} value={tip}>
                    {tip}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-calendar-line mr-2"></i>
                Data de la
              </label>
              <input
                type="date"
                value={filterDataFrom}
                onChange={(e) => setFilterDataFrom(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-calendar-check-line mr-2"></i>
                Data până la
              </label>
              <input
                type="date"
                value={filterDataTo}
                onChange={(e) => setFilterDataTo(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className={`mb-6 flex items-center justify-between ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          <div className="flex items-center gap-2">
            <i className="ri-file-list-3-line text-xl"></i>
            <span className="text-lg font-semibold">
              {filteredLicitatii.length} licitații găsite
            </span>
          </div>
        </div>

        {/* Licitații Grid */}
        {isLoading ? (
          <div className={`text-center py-20 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-lg font-medium">Se încarcă licitațiile...</p>
          </div>
        ) : filteredLicitatii.length === 0 ? (
          <div className={`text-center py-20 rounded-2xl ${
            isDarkMode ? 'bg-white/5' : 'bg-gray-100'
          }`}>
            <div className={`mb-4 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {licitatii.length === 0 ? (
                <>
                  <i className="ri-inbox-line text-6xl mb-4 block"></i>
                  <p className="text-xl font-semibold mb-2">Nu există licitații în baza de date</p>
                  <p className="text-sm mb-6">
                    Pentru a importa licitații ANAF, accesează pagina de administrare.
                  </p>
                  <button
                    onClick={() => router.push('/admin/imports')}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <i className="ri-upload-cloud-line mr-2"></i>
                    Accesează Importuri
                  </button>
                </>
              ) : (
                <>
                  <i className="ri-search-line text-6xl mb-4 block"></i>
                  <p className="text-xl font-semibold mb-2">Nu s-au găsit licitații</p>
                  <p className="text-sm">
                    Încearcă să modifici filtrele sau termenul de căutare.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLicitatii.map((licitatie) => (
              <div
                key={licitatie.id}
                className={`rounded-2xl shadow-lg border overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 backdrop-blur-lg' 
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className={`p-6 ${
                  isDarkMode ? 'bg-gradient-to-br from-blue-600/20 to-blue-600/20' : 'bg-gradient-to-br from-blue-50 to-blue-50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isDarkMode ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500 text-white'
                    }`}>
                      #{licitatie.numar_licitatie || 'N/A'}
                    </span>
                    <span className={`text-xs font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      <i className="ri-calendar-line mr-1"></i>
                      {formatDate(licitatie.data_licitatie)}
                    </span>
                  </div>

                  <h3 className={`text-xl font-bold mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {licitatie.tip_bun || 'Bun necunoscut'}
                  </h3>

                  {licitatie.categoria_teren && (
                    <p className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      {licitatie.categoria_teren}
                    </p>
                  )}

                  {/* Street View Thumbnail */}
                  {licitatie.street_view_image_url && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          // Deschide imaginea în mărime completă
                          window.open(licitatie.street_view_image_url || '', '_blank');
                        }}
                        className="relative w-full h-32 rounded-lg overflow-hidden group cursor-pointer"
                      >
                        <img
                          src={licitatie.street_view_image_url}
                          alt={`Street View - ${licitatie.adresa || licitatie.localitate}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                          <div className={`px-3 py-1 rounded-full backdrop-blur-sm ${
                            isDarkMode ? 'bg-white/20 text-white' : 'bg-black/20 text-black'
                          } opacity-0 group-hover:opacity-100 transition-opacity duration-300`}>
                            <i className="ri-fullscreen-line mr-2"></i>
                            Click pentru mărime completă
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                  
                  {!licitatie.street_view_image_url && licitatie.lat && licitatie.lng && (
                    <div className={`mt-3 p-3 rounded-lg text-sm text-center ${
                      isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <i className="ri-map-pin-line mr-2"></i>
                      Street View nu este disponibil pentru această locație
                    </div>
                  )}
                </div>

                <div className="p-6">
                <div className="space-y-3 mb-6">
                  <div className={`flex items-start gap-3 p-3 rounded-xl ${
                    isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                  }`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                    }`}>
                      <i className="ri-map-pin-line text-blue-600 text-lg"></i>
                    </div>
                    <div className={`text-sm ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      <p className="font-bold text-base">{licitatie.localitate}</p>
                      <p className="font-medium">{licitatie.judet}</p>
                      {licitatie.adresa && <p className="text-xs mt-1 opacity-75">{licitatie.adresa}</p>}
                    </div>
                  </div>

                  {licitatie.suprafata_totala && (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${
                      isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDarkMode ? 'bg-green-500/20' : 'bg-green-100'
                      }`}>
                        <i className="ri-ruler-line text-green-600 text-lg"></i>
                      </div>
                      <span className={`text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {licitatie.suprafata_totala} {licitatie.unitate_suprafata || 'mp'}
                      </span>
                    </div>
                  )}

                  {licitatie.pret_evaluare && (
                    <div className={`flex items-center gap-3 p-4 rounded-xl ${
                      isDarkMode ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30' : 'bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200'
                    }`}>
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDarkMode ? 'bg-yellow-500/30' : 'bg-yellow-500'
                      }`}>
                        <i className={`text-xl ${
                          isDarkMode ? 'ri-money-euro-circle-line text-yellow-300' : 'ri-money-euro-circle-line text-white'
                        }`}></i>
                      </div>
                      <div>
                        <p className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>Preț evaluare</p>
                        <span className={`text-xl font-bold ${
                          isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                        }`}>
                          {formatPrice(licitatie.pret_evaluare, licitatie.moneda)}
                        </span>
                        {licitatie.tva_inclus && (
                          <span className={`text-xs ml-2 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>(TVA inclus)</span>
                        )}
                      </div>
                    </div>
                  )}

                  {licitatie.data_licitatie && licitatie.ora_licitatie && (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${
                      isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                      }`}>
                        <i className="ri-time-line text-blue-600 text-lg"></i>
                      </div>
                      <span className={`text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {formatDate(licitatie.data_licitatie)} la {licitatie.ora_licitatie}
                      </span>
                    </div>
                  )}

                  {licitatie.loc_licitatie && (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${
                      isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                      }`}>
                        <i className="ri-building-line text-blue-600 text-lg"></i>
                      </div>
                      <span className={`text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>{licitatie.loc_licitatie}</span>
                    </div>
                  )}
                </div>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                  {licitatie.pdf_url && (
                    <a
                      href={licitatie.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-3 bg-blue-600 text-white text-center rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 text-sm font-semibold"
                    >
                      <i className="ri-file-pdf-line mr-2"></i>
                      PDF
                    </a>
                  )}
                  {licitatie.product_id && (
                    <button
                      onClick={async () => {
                        try {
                          const { data: product, error } = await supabase
                            .from('products')
                            .select('url, slug, product_type')
                            .eq('id', licitatie.product_id)
                            .neq('status', 'deleted')
                            .maybeSingle();

                          if (error) {
                            console.error('Eroare la încărcarea produsului pentru redirect:', error);
                            return;
                          }

                          if (product?.url) {
                            router.push(product.url);
                            return;
                          }

                          if (product?.slug) {
                            const productTypeRoutes: Record<string, string> = {
                              'licitatii-publice': 'licitatii-publice',
                              'live-bid': 'live_bid',
                              'buy-now': 'produs',
                            };
                            const route =
                              productTypeRoutes[product.product_type as string] || 'produse';
                            router.push(`/${route}/${product.slug}`);
                          }
                        } catch (err) {
                          console.error('Unexpected error redirecting to product:', err);
                        }
                      }}
                      className="flex-1 px-4 py-3 bg-green-600 text-white text-center rounded-xl hover:bg-green-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 text-sm font-semibold"
                    >
                      <i className="ri-eye-line mr-2"></i>
                      Vezi Detalii
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LicitatiiPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Se încarcă...</p>
        </div>
      </div>
    }>
      <LicitatiiPageContent />
    </Suspense>
  );
}

