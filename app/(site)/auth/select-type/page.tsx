"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";

export default function SelectAccountTypePage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  const handleSelectType = (type: 'private' | 'executor' | 'company' | 'liquidator' | 'piese_auto') => {
    if (type === 'company') {
      router.push(`/auth/register/company?type=${type}`);
    } else {
      router.push(`/auth?mode=register&type=${type}`);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-100 via-gray-50 to-white'
    }`}>
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      <main className="flex-1 flex flex-col items-center justify-center w-full min-h-0 px-4 py-6 md:py-10 lg:py-12">
        <div className="max-w-7xl w-full">
          <div className="mb-4 md:mb-8 flex justify-center md:justify-start">
            <BackButton fallbackHref="/" label="Înapoi" className="shadow-md" />
          </div>
          {/* Header */}
          <div className="text-center mb-8 md:mb-12">
            <h1 className={`text-2xl md:text-5xl font-bold mb-2 md:mb-4 ${
              isDarkMode 
                ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
                : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent'
            }`}>
              Selectează Tipul de Cont
            </h1>
            <p className={`text-sm md:text-xl ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Alege tipul de cont care se potrivește cel mai bine nevoilor tale
            </p>
          </div>

          {/* Account Type Cards - full width, spațios; butoane aliniate pe același rând */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 md:gap-8 lg:gap-10 items-stretch">
            {/* Private Account */}
            <div
              onClick={() => handleSelectType('private')}
              className={`flex flex-col p-6 md:p-8 lg:p-10 rounded-xl md:rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                isDarkMode
                  ? 'bg-white/10 backdrop-blur-lg border-white/20 hover:border-blue-500'
                  : 'bg-white border-gray-200 hover:border-blue-500 shadow-lg'
              }`}
            >
              <div className="text-center flex flex-col flex-1">
                <div className="flex justify-center mb-2 md:mb-4">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 mx-auto ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image src="/user.png" alt="Cont Privat" width={80} height={80} className="w-full h-full object-contain p-1.5" />
                  </div>
                </div>
                <h3 className={`text-lg md:text-2xl font-bold mb-2 md:mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Cont Privat
                </h3>
                <p className={`text-xs md:text-sm mb-4 md:mb-6 flex-1 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Pentru utilizatori privați care doresc să liciteze și să cumpere produse
                </p>
                <div className={`mt-auto px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold transition-all duration-300 text-sm md:text-base relative overflow-hidden group ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                }`}>
                  <span className="relative z-10">Selectează</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
              </div>
            </div>

            {/* Executor Account */}
            <div
              onClick={() => handleSelectType('executor')}
              className={`flex flex-col p-6 md:p-8 lg:p-10 rounded-xl md:rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                isDarkMode
                  ? 'bg-white/10 backdrop-blur-lg border-white/20 hover:border-blue-500'
                  : 'bg-white border-gray-200 hover:border-blue-500 shadow-lg'
              }`}
            >
              <div className="text-center flex flex-col flex-1">
                <div className="flex justify-center mb-2 md:mb-4">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 mx-auto ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image src="/executori.jpeg" alt="Executor Judecătoresc" width={80} height={80} className="w-full h-full object-cover" />
                  </div>
                </div>
                <h3 className={`text-lg md:text-2xl font-bold mb-2 md:mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Executor Judecătoresc
                </h3>
                <p className={`text-xs md:text-sm mb-4 md:mb-6 flex-1 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Pentru execuți judecătorești care gestionează licitații și execuții
                </p>
                <div className={`mt-auto px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold transition-all duration-300 text-sm md:text-base relative overflow-hidden group ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                }`}>
                  <span className="relative z-10">Selectează</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
              </div>
            </div>

            {/* Lichidatori Account */}
            <div
              onClick={() => handleSelectType('liquidator')}
              className={`flex flex-col p-6 md:p-8 lg:p-10 rounded-xl md:rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                isDarkMode
                  ? 'bg-white/10 backdrop-blur-lg border-white/20 hover:border-amber-500'
                  : 'bg-white border-gray-200 hover:border-amber-500 shadow-lg'
              }`}
            >
              <div className="text-center flex flex-col flex-1">
                <div className="flex justify-center mb-2 md:mb-4">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 mx-auto ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image src="/images/logo-unpir.png" alt="Lichidatori" width={80} height={80} className="w-full h-full object-contain object-[55%_50%] p-1.5" />
                  </div>
                </div>
                <h3 className={`text-lg md:text-2xl font-bold mb-2 md:mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Lichidatori
                </h3>
                <p className={`text-xs md:text-sm mb-4 md:mb-6 flex-1 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Pentru lichidatori care gestionează proceduri de lichidare și insolvență
                </p>
                <div className={`mt-auto px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold transition-all duration-300 text-sm md:text-base relative overflow-hidden group ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-700 hover:via-orange-700 hover:to-amber-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-700 hover:via-orange-700 hover:to-amber-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                }`}>
                  <span className="relative z-10">Selectează</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
              </div>
            </div>

            {/* Piese Auto (Dealer) */}
            <div
              onClick={() => handleSelectType('piese_auto')}
              className={`flex flex-col p-6 md:p-8 lg:p-10 rounded-xl md:rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                isDarkMode
                  ? 'bg-white/10 backdrop-blur-lg border-white/20 hover:border-amber-500'
                  : 'bg-white border-gray-200 hover:border-amber-500 shadow-lg'
              }`}
            >
              <div className="text-center flex flex-col flex-1">
                <div className="flex justify-center mb-2 md:mb-4">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 mx-auto flex items-center justify-center ${
                    isDarkMode ? 'border-white/20 bg-amber-500/20' : 'border-gray-200 bg-amber-50'
                  }`}>
                    <span className="text-3xl md:text-4xl" aria-hidden>🔧</span>
                  </div>
                </div>
                <h3 className={`text-lg md:text-2xl font-bold mb-2 md:mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Piese Auto
                </h3>
                <p className={`text-xs md:text-sm mb-4 md:mb-6 flex-1 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Pentru dealeri și comercianți de piese auto și accesorii
                </p>
                <div className={`mt-auto px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold transition-all duration-300 text-sm md:text-base relative overflow-hidden group ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-600 hover:via-orange-600 hover:to-amber-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-600 hover:via-orange-600 hover:to-amber-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                }`}>
                  <span className="relative z-10">Selectează</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
              </div>
            </div>

            {/* Company Account */}
            <div
              onClick={() => handleSelectType('company')}
              className={`flex flex-col p-6 md:p-8 lg:p-10 rounded-xl md:rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                isDarkMode
                  ? 'bg-white/10 backdrop-blur-lg border-white/20 hover:border-green-500'
                  : 'bg-white border-gray-200 hover:border-green-500 shadow-lg'
              }`}
            >
              <div className="text-center flex flex-col flex-1">
                <div className="flex justify-center mb-2 md:mb-4">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 mx-auto ${
                    isDarkMode ? 'border-white/20' : 'border-gray-200'
                  }`}>
                    <Image src="/company%20.png" alt="Cont Firmă" width={80} height={80} className="w-full h-full object-contain p-1.5" />
                  </div>
                </div>
                <h3 className={`text-lg md:text-2xl font-bold mb-2 md:mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Cont Firmă
                </h3>
                <p className={`text-xs md:text-sm mb-4 md:mb-6 flex-1 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Pentru firme și companii care doresc să participe la licitații
                </p>
                <div className={`mt-auto px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold transition-all duration-300 text-sm md:text-base relative overflow-hidden group ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 hover:from-green-700 hover:via-emerald-700 hover:to-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 hover:from-green-700 hover:via-emerald-700 hover:to-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
                }`}>
                  <span className="relative z-10">Selectează</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className={`mt-4 md:mt-8 text-center ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            <p className="text-xs md:text-sm">
              Ai deja cont? <a href="/auth" className="text-blue-500 hover:text-blue-600 underline">Autentifică-te</a>
            </p>
          </div>
        </div>
      </main>

      <footer className="flex-shrink-0">
        <DashboardFooter isDarkMode={isDarkMode} />
      </footer>
    </div>
  );
}
