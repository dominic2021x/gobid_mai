"use client";

import { useLayoutEffect } from "react";

/** Chromium-only; not in lib.dom Navigator (see MDN: Navigator/deviceMemory). */
type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

/**
 * Applies dark mode and low-performance class to <html> as early as possible on the client.
 * useLayoutEffect runs before browser paint so skeletons using Tailwind `dark:` match localStorage.
 * Server HTML stays without `dark`; client first paint may still flash once before layout effect.
 */
export default function ThemeAndPerfBootstrap() {
  useLayoutEffect(() => {
    try {
      const htmlElement = document.documentElement;

      const nav = navigator as NavigatorWithDeviceMemory;
      const cores =
        typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 4;
      const memory =
        typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
      const isLowEnd = cores <= 4 || memory < 4;
      if (isLowEnd) htmlElement.classList.add("low-performance");

      const pathname =
        typeof window !== "undefined" ? window.location.pathname : "";
      const isAdmin = pathname.startsWith("/admin");
      const isContact = pathname === "/contact";
      let darkMode = false;

      if (isAdmin) {
        darkMode = false;
        try {
          localStorage.setItem("darkMode", "false");
        } catch {
          // ignore
        }
      } else if (isContact) {
        darkMode = false;
      } else {
        const saved = localStorage.getItem("darkMode");
        if (saved === "true") {
          darkMode = true;
        } else {
          if (saved === null) {
            try {
              localStorage.setItem("darkMode", "false");
            } catch {
              // ignore
            }
          }
          darkMode = false;
        }
      }

      htmlElement.classList.remove("dark");
      if (darkMode) {
        htmlElement.classList.add("dark");
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[ThemeAndPerfBootstrap]", e);
      }
      try {
        document.documentElement.classList.remove("dark");
      } catch {
        // ignore
      }
    }
  }, []);

  return null;
}
