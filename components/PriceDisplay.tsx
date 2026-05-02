"use client";

import { DISPLAY_RON_LABEL } from "@/lib/currency";

interface PriceDisplayProps {
  originalPrice: number;
  discountPercent: number;
  currency?: string;
  period?: string;
  isDarkMode?: boolean;
  className?: string;
}

function PriceDisplay({
  originalPrice,
  discountPercent,
  currency = 'RON',
  period = '/lună',
  isDarkMode = false,
  className = '',
}: PriceDisplayProps) {
  const currencyLabel = currency === "EUR" ? "EUR" : DISPLAY_RON_LABEL;
  const discountedPrice = Math.round(originalPrice * (1 - discountPercent / 100));
  const discountColor = discountPercent >= 50 ? 'green' : discountPercent >= 30 ? 'orange' : 'red';

  if (discountPercent <= 0) {
    return (
      <div className={`mb-0.5 sm:mb-1 md:mb-2 ${className}`}>
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 sm:gap-x-2 gap-y-0">
          <span
            className={`text-sm sm:text-base md:text-2xl lg:text-3xl font-bold transition-colors ${
              isDarkMode ? 'text-gray-200' : 'text-gray-900'
            }`}
          >
            {originalPrice} {currencyLabel}
          </span>
          <span className={`text-[10px] sm:text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {period}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-0.5 sm:mb-1 md:mb-2 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 sm:gap-x-2 gap-y-0">
        <span className={`text-[10px] sm:text-xs md:text-base font-medium transition-colors line-through ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {originalPrice} {currencyLabel}
        </span>
        <span className={`text-sm sm:text-base md:text-2xl lg:text-3xl font-bold transition-colors ${
          discountColor === 'green' ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
          discountColor === 'orange' ? (isDarkMode ? 'text-orange-400' : 'text-orange-600') :
          (isDarkMode ? 'text-red-400' : 'text-red-600')
        }`}>
          {discountedPrice} {currencyLabel}
        </span>
        <span className={`text-[10px] sm:text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {period}
        </span>
      </div>
    </div>
  );
}

export { PriceDisplay };
export default PriceDisplay;


