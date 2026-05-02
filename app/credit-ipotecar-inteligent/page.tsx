"use client";

import { useState, useEffect } from "react";
import Calculator from "./Calculator";
import AIHelper from "./AIHelper";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import { applyDarkModeToHTML, getDarkModeFromStorage, saveDarkModeToStorage } from "@/lib/darkMode";

interface MonthlyPaymentDetail {
  month: number;
  balance: number;
  interest: number;
  principalPaid: number;
  extraPayment: number;
  totalPayment: number;
}

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
  monthlyDetails?: MonthlyPaymentDetail[];
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
    currency: "RON" | "EUR";
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    extraPaymentMonthly: number;
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
    currency: "RON" | "EUR";
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    extraPaymentMonthly: number;
    result: CalculationResult;
  }) => {
    setCalculationData(data);
  };

  return (
    <div
      className={`min-h-screen relative overflow-hidden transition-colors duration-300 ${
        isDarkMode 
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" 
          : "bg-gradient-to-br from-blue-50 via-blue-50 to-blue-50"
      }`}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          isDarkMode ? 'bg-blue-500' : 'bg-blue-400'
        } animate-pulse`}></div>
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          isDarkMode ? 'bg-blue-500' : 'bg-blue-400'
        } animate-pulse`} style={{ animationDelay: '1s' }}></div>
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 ${
          isDarkMode ? 'bg-blue-500' : 'bg-blue-400'
        } animate-pulse`} style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Universal Header */}
      <div className="relative z-10">
        <UniversalHeader
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Calculator */}
          <div className="order-1 lg:order-1 animate-fade-in">
            <Calculator onCalculate={handleCalculate} isDarkMode={isDarkMode} />
          </div>

          {/* AI Helper */}
          <div className="order-2 lg:order-2">
            <div className="sticky top-24 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <AIHelper calculationData={calculationData} isDarkMode={isDarkMode} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer – componentă din components/DashboardFooter */}
      <div className="relative z-10 mt-12">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
