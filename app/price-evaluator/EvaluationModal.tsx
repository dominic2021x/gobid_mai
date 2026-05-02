"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { ProductForEvaluation, PriceRanges, PriceLevel, AIExplanation } from "@/lib/types/priceEvaluation";
import PriceGauge from "./PriceGauge";

interface EvaluationModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductForEvaluation;
  ranges: PriceRanges;
  level: PriceLevel;
  aiExplanation: AIExplanation;
  stats: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    samplesCount: number;
  };
  displayCurrency?: string;
  priceDisplay?: number;
  isDarkMode?: boolean;
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
  auto: "Comparația se face cu vehicule similare, luând în considerare marca, modelul, anul fabricației, kilometrajul, motorizarea și nivelul de echipare.",
  apartment: "Comparația se face cu apartamente similare, luând în considerare orașul, zona/cartierul, suprafața, numărul de camere, anul construcției și îmbunătățirile.",
  house: "Comparația se face cu case și vile similare, luând în considerare orașul, zona, suprafața construită, terenul, numărul de camere, anul construcției și stare. Pentru licitații publice, prețurile sunt de obicei 30-60% sub valoarea de piață.",
  land: "Comparația se face cu terenuri similare, luând în considerare locația, suprafața și tipul de teren (intravilan/extravilan).",
  electronics: "Comparația se face cu produse similare, luând în considerare brandul, modelul, anul lansării și starea produsului.",
  fashion: "Comparația se face cu produse similare, luând în considerare brandul, tipul produsului, starea și raritatea.",
  other: "Comparația se face cu produse similare disponibile pe piață.",
};

const formatPrice = (value: number, currency: string): string => {
  // Formatează prețul cu separator de mii
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currency === "EUR" ? "EUR" : currency === "USD" ? "USD" : "RON",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export default function EvaluationModal({
  open,
  onClose,
  product,
  ranges,
  level,
  aiExplanation,
  stats,
  displayCurrency,
  priceDisplay,
  isDarkMode = false,
}: EvaluationModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) {
    return null;
  }

  const effectiveCurrency = displayCurrency ?? product.currency;
  const priceToShow = priceDisplay ?? product.price;
  const subtitle = categorySubtitles[product.category] || categorySubtitles.other;

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
        onClick={onClose}
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
            }`}>{subtitle}</p>
          </div>
          <button
            onClick={onClose}
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
          {/* Price Ranges Bar - Design identic cu mobile.de */}
          <div className="relative w-full overflow-hidden">
            {(() => {
              // Determină culoarea chenarului în funcție de level - exact ca în PriceGauge
              const getBoxColor = (): { bg: string; text: string; arrow: string } => {
                if (level === 'very_good' || level === 'good' || level === 'fair') {
                  return { bg: 'bg-green-500', text: 'text-white', arrow: '#22C55E' }; // Verde pentru prețuri bune
                } else if (level === 'high') {
                  return { bg: 'bg-red-500', text: 'text-white', arrow: '#EF4444' }; // Roșu pentru preț crescut
                } else {
                  return { bg: 'bg-red-700', text: 'text-white', arrow: '#B91C1C' }; // Roșu închis pentru preț ridicat
                }
              };

              const boxColors = getBoxColor();
              
              // Calculează poziția exactă a săgeții pe bară bazată pe prețul real și range-urile
              let arrowPosition: number;
              
              // Calculează poziția exactă bazată pe prețul real
              const totalRange = stats.maxPrice - stats.minPrice;
              if (totalRange > 0) {
                // Poziția relativă a prețului în range-ul total (0-1)
                const relativePosition = (priceToShow - stats.minPrice) / totalRange;
                // Mapează la poziția pe bară (0-100%)
                arrowPosition = Math.max(0, Math.min(100, relativePosition * 100));
              } else {
                // Fallback la calculul bazat pe level dacă nu avem range-uri valide
                const levelBars: Record<PriceLevel, number> = {
                  very_good: 1,
                  good: 2,
                  fair: 3,
                  high: 4,
                  very_high: 5,
                };
                const filledBars = levelBars[level];
                const segmentIndex = filledBars - 1;
                arrowPosition = ((segmentIndex + 0.5) / 5) * 100;
              }
              
              // Calculează poziția cu limitare inteligentă bazată pe level
              // Pentru very_high (roșu), poziționăm mai spre dreapta dar cu limitare
              // Pentru very_good (verde), poziționăm mai spre stânga
              let clampedPosition: number;
              let transformValue: string;
              let arrowLeftPosition: string;
              
              if (level === 'very_high') {
                // Pentru roșu, poziționăm la dreapta dar cu limitare pentru a se încadra
                clampedPosition = Math.min(95, arrowPosition);
                transformValue = 'translateX(-100%)'; // Aliniere la dreapta
                arrowLeftPosition = 'calc(100% - 12px)'; // Săgeata la dreapta chenarului
              } else if (level === 'very_good') {
                // Pentru verde, poziționăm la stânga
                clampedPosition = Math.max(5, arrowPosition);
                transformValue = 'translateX(0)'; // Aliniere la stânga
                arrowLeftPosition = '12px'; // Săgeata la stânga chenarului
              } else {
                // Pentru celelalte, centrare normală
                clampedPosition = Math.max(10, Math.min(90, arrowPosition));
                transformValue = 'translateX(-50%)'; // Centrare
                arrowLeftPosition = '50%'; // Săgeata centrată
              }
              
              return (
                <>
                  {/* Speech bubble cu prețul curent - design exact ca în imagine */}
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
                        {levelLabels[level]}: {formatPrice(priceToShow, effectiveCurrency)}
                      </div>
                      {/* Triunghi speech bubble - parte integrantă din chenar, mai lung, poziționat corect, culoare identică cu chenarul */}
                      <div 
                        className="absolute pointer-events-none z-10"
                        style={{ 
                          left: arrowLeftPosition,
                          bottom: '-5px',
                          transform: level === 'very_high' || level === 'very_good' ? 'none' : 'translateX(-50%)',
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

            {/* Bara orizontală cu 5 segmente - design identic cu mobile.de */}
            <div className="relative w-full">
              <div className="flex gap-0 rounded-lg overflow-hidden w-full" style={{ minHeight: '40px' }}>
                {/* Preț foarte avantajos - verde gradient mat */}
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
                      {formatPrice(ranges.very_good[0], effectiveCurrency)} - {formatPrice(ranges.very_good[1], effectiveCurrency)}
                    </div>
                    <div className="sm:hidden block">
                      <div className="truncate">{formatPrice(ranges.very_good[0], effectiveCurrency)}</div>
                      <div className="text-[7px]">-</div>
                      <div className="truncate">{formatPrice(ranges.very_good[1], effectiveCurrency)}</div>
                    </div>
                  </div>
                </div>
                {/* Preț convenabil - verde închis cu gradient mat */}
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
                      {formatPrice(ranges.good[0], effectiveCurrency)} - {formatPrice(ranges.good[1], effectiveCurrency)}
                    </div>
                    <div className="sm:hidden block">
                      <div className="truncate">{formatPrice(ranges.good[0], effectiveCurrency)}</div>
                      <div className="text-[7px]">-</div>
                      <div className="truncate">{formatPrice(ranges.good[1], effectiveCurrency)}</div>
                    </div>
                  </div>
                </div>
                {/* Preț potrivit - verde foarte închis cu gradient mat */}
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
                      {formatPrice(ranges.fair[0], effectiveCurrency)} - {formatPrice(ranges.fair[1], effectiveCurrency)}
                    </div>
                    <div className="sm:hidden block">
                      <div className="truncate">{formatPrice(ranges.fair[0], effectiveCurrency)}</div>
                      <div className="text-[7px]">-</div>
                      <div className="truncate">{formatPrice(ranges.fair[1], effectiveCurrency)}</div>
                    </div>
                  </div>
                </div>
                {/* Preț în creștere - roșu cu gradient mat */}
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
                      {formatPrice(ranges.high[0], effectiveCurrency)} - {formatPrice(ranges.high[1], effectiveCurrency)}
                    </div>
                    <div className="sm:hidden block">
                      <div className="truncate">{formatPrice(ranges.high[0], effectiveCurrency)}</div>
                      <div className="text-[7px]">-</div>
                      <div className="truncate">{formatPrice(ranges.high[1], effectiveCurrency)}</div>
                    </div>
                  </div>
                </div>
                {/* Peste nivelul pieței - roșu închis cu gradient mat */}
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
                      {formatPrice(ranges.very_high[0], effectiveCurrency)} - {formatPrice(ranges.very_high[1], effectiveCurrency)}
                    </div>
                    <div className="sm:hidden block">
                      <div className="truncate">{formatPrice(ranges.very_high[0], effectiveCurrency)}</div>
                      <div className="text-[7px]">-</div>
                      <div className="truncate">{formatPrice(ranges.very_high[1], effectiveCurrency)}</div>
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
            }`}>Statistici piață</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div>
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț minim</div>
                <div className={`font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>{formatPrice(stats.minPrice, effectiveCurrency)}</div>
              </div>
              <div>
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț maxim</div>
                <div className={`font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>{formatPrice(stats.maxPrice, effectiveCurrency)}</div>
              </div>
              <div>
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Preț mediu</div>
                <div className={`font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>{formatPrice(stats.avgPrice, effectiveCurrency)}</div>
              </div>
              <div>
                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Oferte analizate</div>
                <div className={`font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>{stats.samplesCount}</div>
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
            onClick={onClose}
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
}

