"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeContextValue = { isDarkMode: boolean; setDarkMode: (v: boolean) => void };

const PieseAutoThemeContext = createContext<ThemeContextValue>({
  isDarkMode: false,
  setDarkMode: () => {},
});

export function PieseAutoThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("darkMode");
    if (saved !== null) setIsDarkMode(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("darkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  return (
    <PieseAutoThemeContext.Provider value={{ isDarkMode, setDarkMode: (v) => setIsDarkMode(v) }}>
      {children}
    </PieseAutoThemeContext.Provider>
  );
}

export function usePieseAutoTheme() {
  return useContext(PieseAutoThemeContext);
}
