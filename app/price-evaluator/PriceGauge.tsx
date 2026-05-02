"use client";

import { PriceLevel } from "@/lib/types/priceEvaluation";

interface PriceGaugeProps {
  level: PriceLevel;
  price: number;
  currency: string;
  compact?: boolean;
  isDarkMode?: boolean;
}

const levelLabels: Record<PriceLevel, string> = {
  very_good: "Preț foarte avantajos",
  good: "Preț convenabil",
  fair: "Preț potrivit",
  high: "Preț în creștere",
  very_high: "Peste nivelul pieței",
};

const getLevelColors = (isDarkMode: boolean): Record<PriceLevel, { filled: string; empty: string }> => ({
  very_good: { filled: "bg-green-500", empty: isDarkMode ? "bg-gray-700" : "bg-gray-200" },
  good: { filled: "bg-green-500", empty: isDarkMode ? "bg-gray-700" : "bg-gray-200" },
  fair: { filled: "bg-green-500", empty: isDarkMode ? "bg-gray-700" : "bg-gray-200" },
  high: { filled: "bg-yellow-500", empty: isDarkMode ? "bg-gray-700" : "bg-gray-200" },
  very_high: { filled: "bg-red-500", empty: isDarkMode ? "bg-gray-700" : "bg-gray-200" },
});

const levelBars: Record<PriceLevel, number> = {
  very_good: 1,  // Primul segment (verde) - cel mai bun preț
  good: 2,       // Al doilea segment (verde)
  fair: 3,      // Al treilea segment (verde)
  high: 4,       // Al patrulea segment (galben)
  very_high: 5,  // Ultimul segment (roșu) - cel mai rău preț
};

export default function PriceGauge({ level, price, currency, compact = false, isDarkMode = false }: PriceGaugeProps) {
  const label = levelLabels[level];
  const colors = getLevelColors(isDarkMode)[level];
  const filledBars = levelBars[level];

  const formatPrice = (value: number, curr: string): string => {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: curr === "EUR" ? "EUR" : curr === "USD" ? "USD" : "RON",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Determină culoarea chenarului în funcție de level
  const getBoxColor = (): string => {
    if (level === 'very_good' || level === 'good' || level === 'fair') {
      return 'bg-green-500';
    } else if (level === 'high') {
      return 'bg-red-500';
    } else {
      return 'bg-red-700';
    }
  };

  const boxColor = getBoxColor();
  const arrowColor = boxColor === 'bg-green-500' ? '#22C55E' : boxColor === 'bg-red-500' ? '#EF4444' : '#B91C1C';

  // Calculează poziția săgeții pe bară (0-100%) - centrul segmentului corespunzător
  // very_good = segment 0 (stânga) = 10% (centrul primului segment: 0-20%)
  // good = segment 1 = 30% (centrul celui de-al doilea segment: 20-40%)
  // fair = segment 2 = 50% (centrul celui de-al treilea segment: 40-60%)
  // high = segment 3 = 70% (centrul celui de-al patrulea segment: 60-80%)
  // very_high = segment 4 (dreapta) = 90% (centrul ultimului segment: 80-100%)
  // Formula: (index_segment + 0.5) / 5 * 100, unde index_segment = filledBars - 1
  const segmentIndex = filledBars - 1; // 0 pentru very_good, 4 pentru very_high
  const arrowPosition = ((segmentIndex + 0.5) / 5) * 100;
  
  // Calculează poziția cu limitare inteligentă bazată pe level (ca în modal)
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
    <div className="w-full">
      {!compact && (
        <div className="relative mb-0" style={{ minHeight: '30px', paddingBottom: '4px' }}>
          {/* Speech bubble cu prețul - poziționat exact unde este săgeata pe bară */}
          <div 
            className={`${boxColor} text-white rounded px-1.5 py-0.5 relative shadow-lg`}
            style={{
              position: 'absolute',
              left: `${clampedPosition}%`,
              top: '0px',
              transform: transformValue,
              whiteSpace: 'nowrap',
              maxWidth: 'calc(100% - 0.5rem)',
              width: 'auto',
              boxSizing: 'border-box',
            }}
          >
            <div className="text-xs font-bold whitespace-nowrap leading-tight">
              {label}: {formatPrice(price, currency)}
            </div>
            {/* Triunghi speech bubble - parte integrantă din chenar, poziționat corect ca în modal */}
            <div 
              className="absolute pointer-events-none z-10"
              style={{ 
                left: arrowLeftPosition,
                bottom: '-4px',
                transform: level === 'very_high' || level === 'very_good' ? 'none' : 'translateX(-50%)',
              }}
            >
              <svg width="14" height="6" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12L0 0H24L12 12Z" fill={arrowColor} />
              </svg>
            </div>
          </div>
        </div>
      )}
      
      {/* Bara cu 5 segmente - verde la stânga (bun), roșu la dreapta (rău) */}
      <div className="relative mb-1">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((index) => {
            // Index direct: 0 = stânga (verde), 4 = dreapta (roșu)
            const isFilled = index < filledBars;
            
            let segmentColor = colors.empty;
            if (isFilled) {
              // Segment 0 (stânga) = verde gradient mat (very_good)
              // Segment 1 = verde închis cu gradient mat (good)
              // Segment 2 = verde foarte închis cu gradient mat (fair)
              // Segment 3 = roșu cu gradient mat (high)
              // Segment 4 (dreapta) = roșu închis cu gradient mat (very_high)
              if (index === 0) {
                segmentColor = isDarkMode 
                  ? 'bg-gradient-to-r from-green-600/60 to-green-500/60' 
                  : 'bg-gradient-to-r from-green-600 to-green-500';
              } else if (index === 1) {
                segmentColor = isDarkMode 
                  ? 'bg-gradient-to-r from-green-700/60 to-green-600/60' 
                  : 'bg-gradient-to-r from-green-700 to-green-600';
              } else if (index === 2) {
                segmentColor = isDarkMode 
                  ? 'bg-gradient-to-r from-green-800/60 to-green-700/60' 
                  : 'bg-gradient-to-r from-green-800 to-green-700';
              } else if (index === 3) {
                segmentColor = isDarkMode 
                  ? 'bg-gradient-to-r from-red-600/60 to-red-500/60' 
                  : 'bg-gradient-to-r from-red-600 to-red-500';
              } else {
                segmentColor = isDarkMode 
                  ? 'bg-gradient-to-r from-red-800/60 to-red-700/60' 
                  : 'bg-gradient-to-r from-red-800 to-red-700';
              }
            } else {
              // Segmentele neumplute au culoarea corespunzătoare poziției
              if (index === 0) {
                segmentColor = colors.empty;
              } else if (index === 1 || index === 2) {
                segmentColor = colors.empty;
              } else if (index === 3) {
                segmentColor = colors.empty;
              } else {
                segmentColor = colors.empty;
              }
            }
            
            return (
              <div
                key={index}
                className={`flex-1 h-2.5 rounded-sm ${
                  isFilled ? segmentColor : colors.empty
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

