"use client";

import { useState, useEffect } from "react";
import UniversalHeader from "@/components/UniversalHeader";
import HomeSearchLauncherClient from "./HomeSearchLauncherClient";

const STORAGE_KEY = "darkMode";
const DARK_MODE_EVENT = "gobid:darkModeChanged";

function useDarkMode(): [boolean, () => void] {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "true") setIsDarkMode(true);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const syncFromStorage = () => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setIsDarkMode(saved === "true");
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setIsDarkMode(event.newValue === "true");
      }
    };

    const onDarkModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsDarkMode(Boolean(customEvent.detail));
    };

    syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(DARK_MODE_EVENT, onDarkModeChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DARK_MODE_EVENT, onDarkModeChanged as EventListener);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode, mounted]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(isDarkMode));
      window.dispatchEvent(new CustomEvent<boolean>(DARK_MODE_EVENT, { detail: isDarkMode }));
    } catch {
      // ignore
    }
  }, [isDarkMode, mounted]);

  const toggle = () => {
    setIsDarkMode((prev) => !prev);
  };

  return [isDarkMode, toggle];
}

/**
 * Minimal above-the-fold client: header + search launcher only.
 * No categories, listings, plans, newsletter, FAB, or modals here (those live in HomeEnhancementsLazy).
 */
export default function HomeEnhancementsClient() {
  const [isDarkMode, toggleDarkMode] = useDarkMode();

  return (
    <>
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <div className="md:hidden w-full px-3 py-2 flex justify-center">
        <HomeSearchLauncherClient isDarkMode={isDarkMode} />
      </div>
    </>
  );
}
