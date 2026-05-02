"use client";

import { useState, useEffect } from "react";
import Calculator from "./Calculator";
import AIHelper from "./AIHelper";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import { applyDarkModeToHTML, getDarkModeFromStorage, saveDarkModeToStorage } from "@/lib/darkMode";

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
}

export default function SmartMortgagePage() {
  // Initialize dark mode from localStorage immediately to prevent flash
  // Default to white mode (false) if not set
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const darkModeValue = getDarkModeFromStorage();
      // Apply immediately before React renders
      applyDarkModeToHTML(darkModeValue);
      return darkModeValue;
    }
    // Default to white mode
    return false;
  });
  
  const [calculationData, setCalculationData] = useState<{
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    monthsToReduce: number;
    result: CalculationResult;
  } | null>(null);

  // Sync dark mode with localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const darkModeValue = getDarkModeFromStorage();
      setIsDarkMode(darkModeValue);
      applyDarkModeToHTML(darkModeValue);
    };

    const handleDarkModeChange = () => {
      const darkModeValue = getDarkModeFromStorage();
      setIsDarkMode(darkModeValue);
      applyDarkModeToHTML(darkModeValue);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('darkModeChanged', handleDarkModeChange);
    window.addEventListener('darkModeToggled', handleDarkModeChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('darkModeChanged', handleDarkModeChange);
      window.removeEventListener('darkModeToggled', handleDarkModeChange);
    };
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    saveDarkModeToStorage(newMode);
    applyDarkModeToHTML(newMode);
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('darkModeToggled'));
  };

  const handleCalculate = (data: {
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    monthsToReduce: number;
    result: CalculationResult;
  }) => {
    setCalculationData(data);
  };

  return (
    <div
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      } transition-colors duration-200`}
    >
      {/* Universal Header */}
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Calculator */}
          <div className="order-2 lg:order-1">
            <Calculator onCalculate={handleCalculate} isDarkMode={isDarkMode} />
          </div>

          {/* AI Helper */}
          <div className="order-1 lg:order-2">
            <div className="sticky top-24">
              <AIHelper calculationData={calculationData} isDarkMode={isDarkMode} />
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div
          className={`mt-8 p-6 rounded-2xl ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          } shadow-lg`}
        >
          <h2 className="text-xl font-bold mb-4">Cum funcționează?</h2>
          <div className="space-y-3 text-sm">
            <p>
              <strong>1. Completează datele creditului:</strong> Introdu suma rămasă de plată,
              dobânda anuală, numărul de luni rămase și câte luni vrei să reduci.
            </p>
            <p>
              <strong>2. Calculează:</strong> Sistemul va calcula automat suma extra necesară
              pentru a reduce creditul cu numărul de luni dorit.
            </p>
            <p>
              <strong>3. Generează text pentru bancă:</strong> Asistentul AI va crea automat un
              text profesional pe care îl poți folosi în cererea către bancă.
            </p>
            <p>
              <strong>4. Economisește:</strong> Vei vedea exact câtă dobândă vei economisi prin
              rambursarea anticipată.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="mt-12">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}

