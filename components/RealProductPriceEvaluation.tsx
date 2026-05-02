'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase';
import PriceGauge from '@/app/price-evaluator/PriceGauge';
import RealPriceEvaluationModal from './RealPriceEvaluationModal';
import { PriceLevel, PriceRanges } from '@/lib/types/priceEvaluation';

interface RealProductPriceEvaluationProps {
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
  isDarkMode?: boolean;
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

interface EvaluationData {
  level: PriceLevel;
  ranges: PriceRanges;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  samplesCount: number;
  comparables: ComparableProduct[];
}

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

const RealProductPriceEvaluation: React.FC<RealProductPriceEvaluationProps> = ({
  product,
  isDarkMode = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Create a stable key from product data to prevent unnecessary re-evaluations
  const productKey = useMemo(() => {
    return JSON.stringify({
      id: product.id,
      title: product.title,
      category: product.category,
      subcategory: product.subcategory,
      price: product.price,
      currency: product.currency,
      city: product.city,
      county: product.county,
    });
  }, [
    product.id,
    product.title,
    product.category,
    product.subcategory,
    product.price,
    product.currency,
    product.city,
    product.county,
  ]);

  useEffect(() => {
    const evaluatePrice = async () => {
      setLoading(true);
      setError(null);
      setEvaluation(null);

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

        setEvaluation({
          level,
          ranges,
          minPrice,
          maxPrice,
          avgPrice,
          medianPrice,
          samplesCount: pricesInRon.length,
          comparables: comparables.slice(0, 10),
        });
      } catch (err: any) {
        console.error('[RealProductPriceEvaluation] Error evaluating price:', err);
        setError(err.message || 'A apărut o eroare la evaluarea prețului.');
      } finally {
        setLoading(false);
      }
    };

    // Validare
    if (!product) {
      setLoading(false);
      setError('Produsul nu este disponibil.');
      return;
    }

    if (!product.title || !product.category || !product.price || product.price <= 0) {
      setLoading(false);
      setError('Date produs incomplete pentru evaluare.');
      return;
    }

    evaluatePrice();
  }, [productKey]);

  if (loading) {
    return (
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
        <div className={`text-sm font-medium mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Preț în curs de evaluare
        </div>
        
        <div className="flex gap-1 mb-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex-1 h-4 rounded-sm price-loader-bar ${
                isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
              }`}
              style={{
                animationName: isDarkMode ? 'priceLoaderFillDark' : 'priceLoaderFill',
                animationDuration: '2.5s',
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
        <p className={`${isDarkMode ? 'text-red-400' : 'text-red-700'} text-sm mb-3`}>{error}</p>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
        <div className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <InformationCircleIcon className="w-5 h-5" />
          <p className="text-sm">
            Evaluarea prețului este în curs de procesare...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`price-evaluation-box ${isDarkMode ? 'bg-gray-800' : 'bg-white'} border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <PriceGauge
              level={evaluation.level}
              price={product.price}
              currency={product.currency}
              compact={false}
              isDarkMode={isDarkMode}
            />
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className={`p-2 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg transition flex-shrink-0`}
            title="Detalii evaluare"
          >
            <InformationCircleIcon className={`w-7 h-7 ${isDarkMode ? 'text-gray-400 hover:text-yellow-400' : 'text-gray-600 hover:text-yellow-500'} transition-colors`} />
          </button>
        </div>
      </div>

      {evaluation && (
        <RealPriceEvaluationModal
          showModal={modalOpen}
          setShowModal={setModalOpen}
          isDarkMode={isDarkMode}
          product={product}
        />
      )}
    </>
  );
};

export default RealProductPriceEvaluation;
