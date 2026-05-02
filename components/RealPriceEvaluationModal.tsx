'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/currency';
import { PriceLevel, PriceRanges, AIExplanation } from '@/lib/types/priceEvaluation';

interface RealPriceEvaluationModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  isDarkMode: boolean;
  product: {
    id?: string;
    title: string;
    category: string;
    subcategory?: string;
    price: number;
    currency: 'RON' | 'EUR';
    city?: string;
    county?: string;
    area?: number;
    rooms?: number;
    [key: string]: any;
  };
}

interface ComparableProduct {
  id: string;
  title: string;
  starting_price: number;
  starting_price_ron: number;
  starting_price_eur: number;
  currency: string;
  city?: string;
  county?: string;
  category: string;
  subcategory?: string;
  created_at: string;
  url?: string;
  slug?: string;
}

interface EvaluationStats {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  samplesCount: number;
  comparables: ComparableProduct[];
  ranges: PriceRanges;
  level: PriceLevel;
}

const levelLabels: Record<PriceLevel, string> = {
  very_good: "Preț foarte avantajos",
  good: "Preț convenabil",
  fair: "Preț potrivit",
  high: "Preț în creștere",
  very_high: "Peste nivelul pieței",
};

const levelDescriptions: Record<PriceLevel, string> = {
  very_good: "Prețul se situează semnificativ sub media pieței pentru produse similare. Recomandăm verificarea detaliată a caracteristicilor produsului, stării tehnice și a condițiilor de vânzare pentru a identifica eventuale limitări sau particularități care justifică acest nivel de preț.",
  good: "Prețul se situează sub media pieței pentru produse comparabile, indicând o oportunitate favorabilă de achiziție în contextul condițiilor de piață actuale.",
  fair: "Prețul este aliniat cu media pieței pentru produse similare, reflectând o evaluare corectă a valorii produsului în raport cu ofertele comparabile disponibile.",
  high: "Prețul depășește ușor media pieței pentru produse comparabile. Diferența poate fi justificată de factori precum localizare, caracteristici specifice sau condiții particulare de tranzacție.",
  very_high: "Prețul depășește semnificativ media pieței pentru produse similare. Această diferență poate fi justificată de factori obiectivi precum localizare strategică, caracteristici distinctive, potențial de valorificare sau condiții specifice ale tranzacției care pot include beneficii suplimentare sau restricții de utilizare.",
};

const categorySubtitles: Record<string, string> = {
  imobiliare: "Comparația se face cu produse similare din baza de date, luând în considerare categoria, subcategoria, locația și prețurile reale de pe piață.",
  auto: "Comparația se face cu vehicule similare, luând în considerare marca, modelul, anul fabricației, kilometrajul, motorizarea și nivelul de echipare.",
  apartment: "Comparația se face cu apartamente similare, luând în considerare orașul, zona/cartierul, suprafața, numărul de camere, anul construcției și îmbunătățirile.",
  house: "Comparația se face cu case și vile similare, luând în considerare orașul, zona, suprafața construită, terenul, numărul de camere și anul construcției. Pentru licitații publice, prețurile sunt de obicei 30-60% sub valoarea de piață.",
  land: "Comparația se face cu terenuri similare, luând în considerare locația, suprafața și tipul de teren (intravilan/extravilan).",
  electronics: "Comparația se face cu produse similare, luând în considerare brandul, modelul, anul lansării și starea produsului.",
  fashion: "Comparația se face cu produse similare, luând în considerare brandul, tipul produsului, starea și raritatea.",
  other: "Comparația se face cu produse similare disponibile pe piață.",
};

// Calculează percentile pentru range-uri
const calculatePercentiles = (prices: number[]): PriceRanges => {
  const sorted = [...prices].sort((a, b) => a - b);
  const len = sorted.length;
  
  if (len === 0) {
    const min = 0;
    const max = 0;
    return {
      very_good: [min, min],
      good: [min, min],
      fair: [min, min],
      high: [min, min],
      very_high: [min, min],
    };
  }

  const p20 = sorted[Math.floor(len * 0.2)] || sorted[0];
  const p40 = sorted[Math.floor(len * 0.4)] || sorted[0];
  const p60 = sorted[Math.floor(len * 0.6)] || sorted[len - 1];
  const p80 = sorted[Math.floor(len * 0.8)] || sorted[len - 1];
  const min = sorted[0];
  const max = sorted[len - 1];

  return {
    very_good: [min, p20],
    good: [p20, p40],
    fair: [p40, p60],
    high: [p60, p80],
    very_high: [p80, max],
  };
};

// Clasifică prețul în funcție de range-uri
const classifyPrice = (price: number, ranges: PriceRanges): PriceLevel => {
  if (price <= ranges.very_good[1]) return 'very_good';
  if (price <= ranges.good[1]) return 'good';
  if (price <= ranges.fair[1]) return 'fair';
  if (price <= ranges.high[1]) return 'high';
  return 'very_high';
};

// Generează explicație bazată pe date reale
const generateExplanation = (
  productPrice: number,
  level: PriceLevel,
  stats: { minPrice: number; maxPrice: number; avgPrice: number; medianPrice: number; samplesCount: number },
  currency: string
): AIExplanation => {
  const diffFromAvg = ((productPrice - stats.avgPrice) / stats.avgPrice) * 100;
  const diffFromMin = ((productPrice - stats.minPrice) / stats.minPrice) * 100;
  const diffFromMax = ((productPrice - stats.maxPrice) / stats.maxPrice) * 100;

  let summary = '';
  let roLong = '';
  const bullets: string[] = [];

  if (level === 'very_good') {
    summary = `Prețul de ${formatPrice(productPrice, currency)} este foarte avantajos comparativ cu piața.`;
    roLong = `Prețul se situează în primele 20% dintre cele mai scăzute prețuri pentru produse similare. Analizând ${stats.samplesCount} produse comparabile, prețul tău este cu ${Math.abs(diffFromAvg).toFixed(1)}% sub media pieței (${formatPrice(stats.avgPrice, currency)}).`;
    bullets.push(`Preț minim găsit: ${formatPrice(stats.minPrice, currency)}`);
    bullets.push(`Preț mediu pe piață: ${formatPrice(stats.avgPrice, currency)}`);
    bullets.push(`Preț median: ${formatPrice(stats.medianPrice, currency)}`);
    bullets.push(`Diferență față de medie: ${Math.abs(diffFromAvg).toFixed(1)}% sub`);
  } else if (level === 'good') {
    summary = `Prețul de ${formatPrice(productPrice, currency)} este convenabil și sub media pieței.`;
    roLong = `Prețul se situează între 20% și 40% dintre cele mai scăzute prețuri pentru produse similare. Analizând ${stats.samplesCount} produse comparabile, prețul tău este cu ${Math.abs(diffFromAvg).toFixed(1)}% sub media pieței (${formatPrice(stats.avgPrice, currency)}).`;
    bullets.push(`Preț minim găsit: ${formatPrice(stats.minPrice, currency)}`);
    bullets.push(`Preț mediu pe piață: ${formatPrice(stats.avgPrice, currency)}`);
    bullets.push(`Preț median: ${formatPrice(stats.medianPrice, currency)}`);
    bullets.push(`Diferență față de medie: ${Math.abs(diffFromAvg).toFixed(1)}% sub`);
  } else if (level === 'fair') {
    summary = `Prețul de ${formatPrice(productPrice, currency)} este potrivit și aliniat cu piața.`;
    roLong = `Prețul se situează între 40% și 60% dintre prețurile pentru produse similare, reflectând o evaluare corectă. Analizând ${stats.samplesCount} produse comparabile, prețul tău este aproape de media pieței (${formatPrice(stats.avgPrice, currency)}).`;
    bullets.push(`Preț minim găsit: ${formatPrice(stats.minPrice, currency)}`);
    bullets.push(`Preț mediu pe piață: ${formatPrice(stats.avgPrice, currency)}`);
    bullets.push(`Preț median: ${formatPrice(stats.medianPrice, currency)}`);
    bullets.push(`Preț maxim găsit: ${formatPrice(stats.maxPrice, currency)}`);
  } else if (level === 'high') {
    summary = `Prețul de ${formatPrice(productPrice, currency)} depășește ușor media pieței.`;
    roLong = `Prețul se situează între 60% și 80% dintre prețurile pentru produse similare. Analizând ${stats.samplesCount} produse comparabile, prețul tău este cu ${diffFromAvg.toFixed(1)}% peste media pieței (${formatPrice(stats.avgPrice, currency)}).`;
    bullets.push(`Preț mediu pe piață: ${formatPrice(stats.avgPrice, currency)}`);
    bullets.push(`Preț median: ${formatPrice(stats.medianPrice, currency)}`);
    bullets.push(`Preț maxim găsit: ${formatPrice(stats.maxPrice, currency)}`);
    bullets.push(`Diferență față de medie: ${diffFromAvg.toFixed(1)}% peste`);
  } else {
    summary = `Prețul de ${formatPrice(productPrice, currency)} depășește semnificativ media pieței.`;
    roLong = `Prețul se situează în ultimele 20% dintre cele mai ridicate prețuri pentru produse similare. Analizând ${stats.samplesCount} produse comparabile, prețul tău este cu ${diffFromAvg.toFixed(1)}% peste media pieței (${formatPrice(stats.avgPrice, currency)}).`;
    bullets.push(`Preț mediu pe piață: ${formatPrice(stats.avgPrice, currency)}`);
    bullets.push(`Preț median: ${formatPrice(stats.medianPrice, currency)}`);
    bullets.push(`Preț maxim găsit: ${formatPrice(stats.maxPrice, currency)}`);
    bullets.push(`Diferență față de medie: ${diffFromAvg.toFixed(1)}% peste`);
  }

  return {
    summary,
    details: {
      ro_short: summary,
      ro_long: roLong,
      bullets,
    },
  };
};

const RealPriceEvaluationModal: React.FC<RealPriceEvaluationModalProps> = ({
  showModal,
  setShowModal,
  isDarkMode,
  product,
}) => {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<EvaluationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showModal && product && mounted) {
      evaluatePrice();
    }
  }, [showModal, product, mounted]);

  const evaluatePrice = async () => {
    setLoading(true);
    setError(null);
    setStats(null);
    setAiExplanation(null);

    try {
      // Construiește query pentru produse similare
      let query = supabase
        .from('products')
        .select('id, title, starting_price, starting_price_ron, starting_price_eur, currency, city, county, category, subcategory, created_at, url, slug')
        .eq('category', product.category)
        .neq('status', 'deleted')
        .neq('status', 'draft');

      // Filtrează după subcategorie dacă există
      if (product.subcategory) {
        query = query.eq('subcategory', product.subcategory);
      }

      // Filtrează după oraș dacă există
      if (product.city) {
        query = query.eq('city', product.city);
      } else if (product.county) {
        query = query.eq('county', product.county);
      }

      // Exclude produsul curent dacă are ID
      if (product.id) {
        query = query.neq('id', product.id);
      }

      // Obține produse similare
      const { data: similarProducts, error: queryError } = await query
        .order('created_at', { ascending: false })
        .limit(200);

      if (queryError) throw queryError;

      if (!similarProducts || similarProducts.length === 0) {
        setError('Nu s-au găsit produse similare pentru comparație.');
        setLoading(false);
        return;
      }

      // Convertește toate prețurile în aceeași monedă (Lei)
      const pricesInRon: number[] = [];
      const comparables: ComparableProduct[] = [];

      for (const p of similarProducts) {
        let priceRon = 0;
        
        if (p.currency === 'RON') {
          priceRon = p.starting_price_ron || p.starting_price || 0;
        } else if (p.currency === 'EUR') {
          // Folosim un curs aproximativ de 5 Lei/EUR dacă nu avem cursul real
          const exchangeRate = 5.0;
          priceRon = (p.starting_price_eur || p.starting_price || 0) * exchangeRate;
        }

        if (priceRon > 0) {
          pricesInRon.push(priceRon);
          comparables.push({
            id: p.id,
            title: p.title,
            starting_price: p.starting_price,
            starting_price_ron: p.starting_price_ron || priceRon,
            starting_price_eur: p.starting_price_eur || 0,
            currency: p.currency,
            city: p.city,
            county: p.county,
            category: p.category,
            subcategory: p.subcategory,
            created_at: p.created_at,
            url: p.url,
            slug: p.slug,
          });
        }
      }

      if (pricesInRon.length === 0) {
        setError('Nu s-au găsit prețuri valide pentru comparație.');
        setLoading(false);
        return;
      }

      // Calculează statistici
      const sortedPrices = [...pricesInRon].sort((a, b) => a - b);
      const minPrice = sortedPrices[0];
      const maxPrice = sortedPrices[sortedPrices.length - 1];
      const avgPrice = pricesInRon.reduce((sum, p) => sum + p, 0) / pricesInRon.length;
      
      // Median
      const mid = Math.floor(sortedPrices.length / 2);
      const medianPrice = sortedPrices.length % 2 === 0
        ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
        : sortedPrices[mid];

      // Calculează range-uri bazate pe percentile
      const ranges = calculatePercentiles(pricesInRon);

      // Convertește prețul produsului în Lei pentru comparație
      const productPriceRon = product.currency === 'RON'
        ? product.price
        : product.price * 5.0; // Curs aproximativ

      // Clasifică prețul
      const level = classifyPrice(productPriceRon, ranges);

      // Generează explicație
      const explanation = generateExplanation(
        productPriceRon,
        level,
        { minPrice, maxPrice, avgPrice, medianPrice, samplesCount: pricesInRon.length },
        product.currency
      );

      setStats({
        minPrice,
        maxPrice,
        avgPrice,
        medianPrice,
        samplesCount: pricesInRon.length,
        comparables: comparables.slice(0, 10),
        ranges,
        level,
      });
      setAiExplanation(explanation);
    } catch (err: any) {
      console.error('Error evaluating price:', err);
      setError(err.message || 'Eroare la evaluarea prețului.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !showModal) return null;

  if (!stats || !aiExplanation) {
    const modalContent = (
      <div 
        className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 price-evaluation-modal" 
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          zIndex: 9999999,
          pointerEvents: 'auto'
        }}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
          style={{ 
            position: 'absolute', 
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999998 
          }}
        />

        <div 
          className={`relative rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden mx-auto flex flex-col ${
            isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
          }`}
          style={{ 
            position: 'relative', 
            zIndex: 9999999,
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex-shrink-0 border-b p-3 sm:p-6 flex items-start sm:items-center justify-between gap-2 ${
            isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg sm:text-2xl font-bold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Evaluarea prețului pentru acest produs</h2>
              <p className={`text-xs sm:text-sm mt-1 line-clamp-2 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>{categorySubtitles[product.category] || categorySubtitles.other}</p>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className={`p-2 rounded-lg transition flex-shrink-0 ${
                isDarkMode ? 'hover:bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-900'
              }`}
            >
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
            {loading && (
              <div className="text-center py-8">
                <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto ${
                  isDarkMode ? 'border-blue-400' : 'border-blue-600'
                }`}></div>
                <p className={`mt-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Se analizează produse similare din baza de date...
                </p>
              </div>
            )}

            {error && (
              <div className={`p-4 rounded-lg border ${
                isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
                  {error}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
  }

  // Convertește prețul produsului în Lei pentru comparație
  const productPriceRon = product.currency === 'RON'
    ? product.price
    : product.price * 5.0;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 price-evaluation-modal" 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        zIndex: 9999999,
        pointerEvents: 'auto'
      }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setShowModal(false)}
        style={{ 
          position: 'absolute', 
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999998 
        }}
      />

      {/* Modal */}
      <div 
        className={`relative rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden mx-auto flex flex-col ${
          isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
        }`}
        style={{ 
          position: 'relative', 
          zIndex: 9999999,
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex-shrink-0 border-b p-3 sm:p-6 flex items-start sm:items-center justify-between gap-2 ${
          isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="flex-1 min-w-0">
            <h2 className={`text-lg sm:text-2xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Evaluarea prețului pentru acest produs</h2>
            <p className={`text-xs sm:text-sm mt-1 line-clamp-2 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>{categorySubtitles[product.category] || categorySubtitles.other}</p>
          </div>
          <button
            onClick={() => setShowModal(false)}
            className={`p-2 rounded-lg transition flex-shrink-0 ${
              isDarkMode ? 'hover:bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-900'
            }`}
          >
            <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* Price Ranges Bar - Design identic */}
            <div className="relative w-full overflow-hidden">
              {(() => {
                // Determină culoarea chenarului în funcție de level
                const getBoxColor = (): { bg: string; text: string; arrow: string } => {
                  if (stats.level === 'very_good' || stats.level === 'good' || stats.level === 'fair') {
                    return { bg: 'bg-green-500', text: 'text-white', arrow: '#22C55E' };
                  } else if (stats.level === 'high') {
                    return { bg: 'bg-red-500', text: 'text-white', arrow: '#EF4444' };
                  } else {
                    return { bg: 'bg-red-700', text: 'text-white', arrow: '#B91C1C' };
                  }
                };

                const boxColors = getBoxColor();
                
                // Calculează poziția exactă a săgeții pe bară bazată pe prețul real
                let arrowPosition: number;
                
                const totalRange = stats.maxPrice - stats.minPrice;
                if (totalRange > 0) {
                  const relativePosition = (productPriceRon - stats.minPrice) / totalRange;
                  arrowPosition = Math.max(0, Math.min(100, relativePosition * 100));
                } else {
                  const levelBars: Record<PriceLevel, number> = {
                    very_good: 1,
                    good: 2,
                    fair: 3,
                    high: 4,
                    very_high: 5,
                  };
                  const filledBars = levelBars[stats.level];
                  const segmentIndex = filledBars - 1;
                  arrowPosition = ((segmentIndex + 0.5) / 5) * 100;
                }
                
                let clampedPosition: number;
                let transformValue: string;
                let arrowLeftPosition: string;
                
                if (stats.level === 'very_high') {
                  clampedPosition = Math.min(95, arrowPosition);
                  transformValue = 'translateX(-100%)';
                  arrowLeftPosition = 'calc(100% - 12px)';
                } else if (stats.level === 'very_good') {
                  clampedPosition = Math.max(5, arrowPosition);
                  transformValue = 'translateX(0)';
                  arrowLeftPosition = '12px';
                } else {
                  clampedPosition = Math.max(10, Math.min(90, arrowPosition));
                  transformValue = 'translateX(-50%)';
                  arrowLeftPosition = '50%';
                }
                
                return (
                  <>
                    {/* Speech bubble cu prețul curent */}
                    <div className="relative mb-1 sm:mb-2 w-full overflow-hidden" style={{ paddingBottom: '6px', minHeight: '30px', marginTop: '0px', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                      <div 
                        className={`${boxColors.bg} ${boxColors.text} rounded px-1.5 sm:px-2 py-0.5 sm:py-1 relative shadow-md`}
                        style={{
                          position: 'absolute',
                          left: `${clampedPosition}%`,
                          top: '0px',
                          transform: transformValue,
                          whiteSpace: 'nowrap',
                          maxWidth: 'calc(100% - 1rem)',
                          width: 'auto',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div className="text-xs font-bold whitespace-nowrap truncate leading-tight">
                          {levelLabels[stats.level]}: {formatPrice(product.price, product.currency)}
                        </div>
                        <div 
                          className="absolute pointer-events-none z-10"
                          style={{ 
                            left: arrowLeftPosition,
                            bottom: '-5px',
                            transform: stats.level === 'very_high' || stats.level === 'very_good' ? 'none' : 'translateX(-50%)',
                          }}
                        >
                          <svg width="16" height="8" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'scaleY(1)' }}>
                            <path d="M12 12L0 0H24L12 12Z" fill={boxColors.arrow} />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Bara orizontală cu 5 segmente */}
              <div className="relative w-full">
                <div className="flex gap-0 rounded-lg overflow-hidden w-full" style={{ minHeight: '40px' }}>
                  {/* Preț foarte avantajos */}
                  <div 
                    className={`flex-1 flex flex-col justify-center px-0.5 sm:px-2 py-1 sm:py-2 backdrop-blur-md ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-green-600/60 to-green-500/60' 
                        : 'bg-gradient-to-r from-green-600 to-green-500'
                    }`}
                  >
                    <div className="text-white text-[9px] sm:text-xs font-bold text-center leading-tight px-0.5 mb-0.5 sm:mb-1">Preț foarte avantajos</div>
                    <div className="text-white text-[8px] sm:text-xs font-bold text-center leading-tight px-0.5">
                      <div className="hidden sm:block">
                        {formatPrice(stats.ranges.very_good[0], product.currency)} - {formatPrice(stats.ranges.very_good[1], product.currency)}
                      </div>
                      <div className="sm:hidden block">
                        <div className="truncate">{formatPrice(stats.ranges.very_good[0], product.currency)}</div>
                        <div className="text-[7px]">-</div>
                        <div className="truncate">{formatPrice(stats.ranges.very_good[1], product.currency)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Preț convenabil */}
                  <div 
                    className={`flex-1 flex flex-col justify-center px-0.5 sm:px-2 py-1 sm:py-2 backdrop-blur-md ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-green-700/60 to-green-600/60' 
                        : 'bg-gradient-to-r from-green-700 to-green-600'
                    }`}
                  >
                    <div className="text-white text-[9px] sm:text-xs font-bold text-center leading-tight px-0.5 mb-0.5 sm:mb-1">Preț convenabil</div>
                    <div className="text-white text-[8px] sm:text-xs font-bold text-center leading-tight px-0.5">
                      <div className="hidden sm:block">
                        {formatPrice(stats.ranges.good[0], product.currency)} - {formatPrice(stats.ranges.good[1], product.currency)}
                      </div>
                      <div className="sm:hidden block">
                        <div className="truncate">{formatPrice(stats.ranges.good[0], product.currency)}</div>
                        <div className="text-[7px]">-</div>
                        <div className="truncate">{formatPrice(stats.ranges.good[1], product.currency)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Preț potrivit */}
                  <div 
                    className={`flex-1 flex flex-col justify-center px-0.5 sm:px-2 py-1 sm:py-2 backdrop-blur-md ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-green-800/60 to-green-700/60' 
                        : 'bg-gradient-to-r from-green-800 to-green-700'
                    }`}
                  >
                    <div className="text-white text-[9px] sm:text-xs font-bold text-center leading-tight px-0.5 mb-0.5 sm:mb-1">Preț potrivit</div>
                    <div className="text-white text-[8px] sm:text-xs font-bold text-center leading-tight px-0.5">
                      <div className="hidden sm:block">
                        {formatPrice(stats.ranges.fair[0], product.currency)} - {formatPrice(stats.ranges.fair[1], product.currency)}
                      </div>
                      <div className="sm:hidden block">
                        <div className="truncate">{formatPrice(stats.ranges.fair[0], product.currency)}</div>
                        <div className="text-[7px]">-</div>
                        <div className="truncate">{formatPrice(stats.ranges.fair[1], product.currency)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Preț în creștere */}
                  <div 
                    className={`flex-1 flex flex-col justify-center px-0.5 sm:px-2 py-1 sm:py-2 backdrop-blur-md ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-red-600/60 to-red-500/60' 
                        : 'bg-gradient-to-r from-red-600 to-red-500'
                    }`}
                  >
                    <div className="text-white text-[9px] sm:text-xs font-bold text-center leading-tight px-0.5 mb-0.5 sm:mb-1">Preț în creștere</div>
                    <div className="text-white text-[8px] sm:text-xs font-bold text-center leading-tight px-0.5">
                      <div className="hidden sm:block">
                        {formatPrice(stats.ranges.high[0], product.currency)} - {formatPrice(stats.ranges.high[1], product.currency)}
                      </div>
                      <div className="sm:hidden block">
                        <div className="truncate">{formatPrice(stats.ranges.high[0], product.currency)}</div>
                        <div className="text-[7px]">-</div>
                        <div className="truncate">{formatPrice(stats.ranges.high[1], product.currency)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Peste nivelul pieței */}
                  <div 
                    className={`flex-1 flex flex-col justify-center px-0.5 sm:px-2 py-1 sm:py-2 backdrop-blur-md ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-red-800/60 to-red-700/60' 
                        : 'bg-gradient-to-r from-red-800 to-red-700'
                    }`}
                  >
                    <div className="text-white text-[9px] sm:text-xs font-bold text-center leading-tight px-0.5 mb-0.5 sm:mb-1">Peste nivelul pieței</div>
                    <div className="text-white text-[8px] sm:text-xs font-bold text-center leading-tight px-0.5">
                      <div className="hidden sm:block">
                        {formatPrice(stats.ranges.very_high[0], product.currency)} - {formatPrice(stats.ranges.very_high[1], product.currency)}
                      </div>
                      <div className="sm:hidden block">
                        <div className="truncate">{formatPrice(stats.ranges.very_high[0], product.currency)}</div>
                        <div className="text-[7px]">-</div>
                        <div className="truncate">{formatPrice(stats.ranges.very_high[1], product.currency)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Explicație niveluri de preț */}
            <div className={`space-y-4 border-t pt-4 mt-4 ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h3 className={`text-base sm:text-lg font-bold mb-3 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Ce înseamnă fiecare nivel de preț?</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-3 bg-gradient-to-r from-green-600 to-green-500 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm sm:text-base ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Preț foarte avantajos</div>
                    <div className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>{levelDescriptions.very_good}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className="w-4 h-3 bg-green-600 rounded"></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm sm:text-base ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Preț convenabil</div>
                    <div className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>{levelDescriptions.good}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-3 bg-green-800 rounded"></div>
                    <div className="w-4 h-3 bg-green-800 rounded"></div>
                    <div className="w-4 h-3 bg-green-800 rounded"></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm sm:text-base ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Preț potrivit</div>
                    <div className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>{levelDescriptions.fair}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-3 bg-red-500 rounded"></div>
                    <div className="w-4 h-3 bg-red-500 rounded"></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm sm:text-base ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Preț în creștere</div>
                    <div className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>{levelDescriptions.high}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    <div className="w-4 h-3 bg-red-700 rounded"></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                    <div className={`w-4 h-3 rounded ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm sm:text-base ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Peste nivelul pieței</div>
                    <div className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>{levelDescriptions.very_high}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Explanation */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className={`text-base sm:text-lg font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Explicație detaliată</h3>
              
              {/* Summary */}
              <div className={`border rounded-lg p-3 sm:p-4 ${
                isDarkMode 
                  ? 'bg-blue-900/20 border-blue-700' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-sm sm:text-base ${
                  isDarkMode ? 'text-blue-200' : 'text-blue-800'
                }`}>{aiExplanation.summary}</p>
              </div>

              {/* Long Description */}
              <div className={`rounded-lg p-3 sm:p-4 ${
                isDarkMode ? 'bg-gray-800' : 'bg-gray-50'
              }`}>
                <p className={`leading-relaxed text-sm sm:text-base ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>{aiExplanation.details.ro_long}</p>
              </div>

              {/* Bullet Points */}
              {aiExplanation.details.bullets.length > 0 && (
                <div className={`rounded-lg p-3 sm:p-4 ${
                  isDarkMode ? 'bg-gray-800' : 'bg-gray-50'
                }`}>
                  <ul className="space-y-2">
                    {aiExplanation.details.bullets.map((bullet, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className={`mt-1 flex-shrink-0 ${
                          isDarkMode ? 'text-green-500' : 'text-green-600'
                        }`}>•</span>
                        <span className={`text-sm sm:text-base ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className={`rounded-lg p-3 sm:p-4 ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-50'
            }`}>
              <h4 className={`text-xs sm:text-sm font-semibold mb-2 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Statistici piață (bazate pe {stats.samplesCount} produse similare)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț minim</div>
                  <div className={`font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{formatPrice(stats.minPrice, product.currency)}</div>
                </div>
                <div>
                  <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț maxim</div>
                  <div className={`font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{formatPrice(stats.maxPrice, product.currency)}</div>
                </div>
                <div>
                  <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț mediu</div>
                  <div className={`font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{formatPrice(Math.round(stats.avgPrice), product.currency)}</div>
                </div>
                <div>
                  <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț median</div>
                  <div className={`font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{formatPrice(Math.round(stats.medianPrice), product.currency)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 border-t p-3 sm:p-6 ${
          isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <button
            onClick={() => setShowModal(false)}
            className={`w-full font-semibold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition text-sm sm:text-base ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Închide
          </button>
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default RealPriceEvaluationModal;
