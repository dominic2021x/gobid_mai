"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import Hammer from "@/components/Hammer";

export default function ExecutorAddAuctionPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Load dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, []);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Redirect to my-products with modal open (deps: basePath din pathname, nu router — ref instabilă)
  useEffect(() => {
    router.push(`${basePath}/my-products?openManualModal=true`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  return (
    <div className="min-h-screen transition-all duration-300 relative bg-gradient-to-br from-gray-50/30 via-white/30 to-gray-50/30 dark:from-gray-900/30 dark:via-gray-800/30 dark:to-gray-700/30">
      {/* Background Emblem */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
        style={{ backgroundImage: `url(${bgEmblem})` }}
      />

      {/* Universal Header */}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Loading/Redirecting State */}
      {false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                          <div className="text-center">
            <Hammer 
              size="xl" 
              color="gold" 
              animated={true}
              className="scale-150 mb-4"
            />
            <p className={`text-lg font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
              Redirecionare ctre Produsele mele...
            </p>
          </div>
        </div>
      )}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
