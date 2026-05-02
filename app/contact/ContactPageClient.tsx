"use client";

import { createContext, useContext, useState, useEffect, useLayoutEffect } from "react";
import UniversalHeader from "@/components/UniversalHeader";
import SiteFooter from "@/components/footer/SiteFooter";
import {
  getDarkModeFromStorage,
  saveDarkModeToStorage,
  applyDarkModeToHTML,
} from "@/lib/darkMode";

type ContactThemeContextValue = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setLightMode: () => void;
  setDarkMode: () => void;
};
const ContactThemeContext = createContext<ContactThemeContextValue | null>(null);

export function useContactTheme(): ContactThemeContextValue {
  const ctx = useContext(ContactThemeContext);
  if (!ctx) throw new Error("useContactTheme must be used within ContactPageClient");
  return ctx;
}

export default function ContactPageClient({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Forțează light mode IMEDIAT (înainte de paint) — design premium pe /contact
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    applyDarkModeToHTML(false);
    setIsDarkMode(false);
  }, []);

  // Aplică tema când utilizatorul o schimbă manual (toggle)
  useEffect(() => {
    if (typeof window === "undefined") return;
    applyDarkModeToHTML(isDarkMode);
  }, [isDarkMode]);

  // Sincronizare cu alte tab-uri (opțional)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const saved = getDarkModeFromStorage();
      setIsDarkMode(saved);
      applyDarkModeToHTML(saved);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    applyDarkModeToHTML(newMode);
    saveDarkModeToStorage(newMode);
    window.dispatchEvent(new Event("darkModeChanged"));
  };

  const setLightMode = () => {
    setIsDarkMode(false);
    applyDarkModeToHTML(false);
    saveDarkModeToStorage(false);
    window.dispatchEvent(new Event("darkModeChanged"));
  };

  const setDarkMode = () => {
    setIsDarkMode(true);
    applyDarkModeToHTML(true);
    saveDarkModeToStorage(true);
    window.dispatchEvent(new Event("darkModeChanged"));
  };

  const themeValue: ContactThemeContextValue = { isDarkMode, toggleDarkMode, setLightMode, setDarkMode };

  return (
    <ContactThemeContext.Provider value={themeValue}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      {children}
      <div className="mt-8 sm:mt-12 lg:mt-16">
        <SiteFooter isDarkMode={isDarkMode} />
      </div>
    </ContactThemeContext.Provider>
  );
}
