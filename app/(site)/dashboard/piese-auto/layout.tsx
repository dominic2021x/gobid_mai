"use client";

import React from "react";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import { PieseAutoThemeProvider, usePieseAutoTheme } from "./PieseAutoThemeContext";

function PieseAutoLayoutInner({ children }: { children: React.ReactNode }) {
  const { isDarkMode, setDarkMode } = usePieseAutoTheme();

  return (
    <div
      className={`min-h-screen flex flex-col transition-all duration-300 relative ${
        isDarkMode ? "bg-[#1a1d21]" : "bg-[#f5f6f8]"
      }`}
    >
      {/* Background partajat – pattern + gradient */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        {isDarkMode ? (
          <>
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='%23f97316' fill-opacity='0.03'/%3E%3C/svg%3E")`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1d21] via-[#252a30] to-[#1a1d21]" />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M40 0L80 40L40 80L0 40Z' fill='%23ea580c' fill-opacity='0.04'/%3E%3C/svg%3E")`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 via-[#f5f6f8] to-orange-50/30" />
          </>
        )}
      </div>

      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setDarkMode(!isDarkMode)}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 md:py-8 relative z-10">
        {children}
      </main>

      <DashboardFooter />
    </div>
  );
}

export default function PieseAutoLayout({ children }: { children: React.ReactNode }) {
  return (
    <PieseAutoThemeProvider>
      <PieseAutoLayoutInner>{children}</PieseAutoLayoutInner>
    </PieseAutoThemeProvider>
  );
}
