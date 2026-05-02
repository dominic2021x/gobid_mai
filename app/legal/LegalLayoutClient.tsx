"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";

interface NavItem {
  href: string;
  label: string;
}

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "")
    .trim();
}

export default function LegalLayoutClient({
  children,
  navItems,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const isSubpage = pathname !== "/legal";
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      const saved = localStorage.getItem("darkMode");
      if (saved !== null) setIsDarkMode(saved === "true");
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      if (isDarkMode) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== "undefined") localStorage.setItem("darkMode", String(newMode));
  };

  const filteredNavItems = useMemo(() => {
    if (!search.trim()) return navItems;
    const q = normalizeForSearch(search);
    return navItems.filter((item) => normalizeForSearch(item.label).includes(q));
  }, [navItems, search]);

  if (!mounted) return null;

  const base = "transition-colors text-sm";
  const active = isDarkMode ? "text-blue-300 font-semibold" : "text-blue-600 font-semibold";
  const inactive = isDarkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-900";

  const inputClasses = "w-full rounded-lg border px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const inputDark = "dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-gray-400";
  const inputLight = "border-gray-300 bg-white text-gray-900";

  return (
    <div
      className={
        isDarkMode
          ? "min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white"
          : "min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 text-gray-900"
      }
    >
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <div className="mx-auto flex max-w-6xl gap-8 px-6 pb-20 pt-28 sm:px-10 lg:px-16">
        <aside className="hidden w-64 flex-shrink-0 lg:block">
          <div className="sticky top-28 space-y-3">
            <input
              type="search"
              placeholder="Caută document..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Caută în documente legale"
              className={`${inputClasses} ${isDarkMode ? inputDark : inputLight}`}
            />
            <nav
              className="space-y-1 rounded-xl border p-4"
              style={{ borderColor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgb(229,231,235)" }}
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider opacity-70">Index</h2>
              {filteredNavItems.length > 0 ? (
                filteredNavItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`block rounded-lg px-3 py-2 ${base} ${pathname === href || (href !== "/legal" && pathname.startsWith(href)) ? active : inactive}`}
                  >
                    {label}
                  </Link>
                ))
              ) : (
                <p className="text-sm opacity-70">Niciun rezultat pentru „{search}"</p>
              )}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          {isSubpage && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => router.back()}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  isDarkMode
                    ? "border-white/20 text-gray-300 hover:bg-white/10 hover:text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
                aria-label="Înapoi"
              >
                <span aria-hidden>←</span>
                Înapoi
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
