"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import ProductPriceEvaluation from "./ProductPriceEvaluation";
import { ProductForEvaluation } from "@/lib/types/priceEvaluation";

function PriceEvaluatorContent() {
  const searchParams = useSearchParams();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [product, setProduct] = useState<ProductForEvaluation | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  useEffect(() => {
    // Try to get product from URL params or localStorage
    const productId = searchParams.get('id');
    const productData = searchParams.get('product');
    
    if (productData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(productData));
        setProduct(parsed);
      } catch (e) {
        console.error('Error parsing product data:', e);
      }
    } else if (productId && typeof window !== 'undefined') {
      // Try to get from localStorage
      const stored = localStorage.getItem(`product_${productId}`);
      if (stored) {
        try {
          setProduct(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing stored product:', e);
        }
      }
    }
  }, [searchParams]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  if (!product) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-12">
          <div className={`w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-8 text-center`}>
            <h1 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Evaluare Preț
            </h1>
            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
              Nu s-a găsit niciun produs de evaluat. Te rugăm să accesezi această pagină dintr-un produs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className={`text-3xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Evaluare Preț
          </h1>
          <ProductPriceEvaluation product={product} isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  );
}

export default function PriceEvaluatorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PriceEvaluatorContent />
    </Suspense>
  );
}

