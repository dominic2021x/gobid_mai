"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";

export default function DeleteAccountPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      const saved = localStorage.getItem("darkMode");
      if (saved !== null) {
        setIsDarkMode(saved === "true");
      }
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      if (isDarkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem("darkMode", String(newMode));
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        isDarkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <Link
            href="/"
            className={`inline-flex items-center gap-2 mb-8 text-sm transition-colors ${
              isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            ← Înapoi la gobid.ro
          </Link>

          <article className="space-y-10">
            <header>
              <h1
                className={`text-3xl sm:text-4xl font-bold tracking-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Ștergere cont – gobid.ro
              </h1>
              <p
                className={`mt-4 text-lg ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Această pagină explică cum poți șterge contul și ce se întâmplă cu datele tale.
                Pagina este publică și nu necesită autentificare.
              </p>
            </header>

            <section className="space-y-4">
              <h2
                className={`text-xl font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                A. Cum ștergi contul
              </h2>
              <ol
                className={`list-decimal list-inside space-y-2 leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <li>Autentifică-te în cont</li>
                <li>
                  Accesează Setări cont: Dashboard → Setări sau direct{" "}
                  <Link
                    href="/dashboard/settings?tab=delete-account"
                    className="text-blue-500 hover:underline"
                  >
                    /dashboard/settings?tab=delete-account
                  </Link>
                </li>
                <li>Apasă „Șterge cont”</li>
                <li>Confirmă în fereastra de dialog (ștergerea este permanentă)</li>
                <li>Confirmare prin email (dacă există acest pas)</li>
              </ol>
            </section>

            <section className="space-y-4">
              <h2
                className={`text-xl font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                B. Ce date sunt șterse
              </h2>
              <ul
                className={`list-disc list-inside space-y-2 leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <li>Date profil (nume, email, telefon)</li>
                <li>Mesaje și conversații</li>
                <li>Anunțuri active</li>
                <li>Imagini încărcate</li>
                <li>Preferințe cont și favorite</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2
                className={`text-xl font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                C. Ce date pot fi păstrate
              </h2>
              <p className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                În funcție de obligațiile legale, pot rămâne:
              </p>
              <ul
                className={`list-disc list-inside space-y-2 leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <li>Facturi (dacă există obligații legale)</li>
                <li>Loguri de securitate (maxim 30 zile)</li>
                <li>Date necesare pentru conformitate legală</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2
                className={`text-xl font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                D. Timp procesare
              </h2>
              <ul
                className={`list-disc list-inside space-y-2 leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                <li>Ștergerea este inițiată imediat</li>
                <li>Eliminarea completă în maxim 30 zile</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2
                className={`text-xl font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                E. Contact GDPR
              </h2>
              <p className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                Pentru cereri privind datele personale și drepturile GDPR, contactează-ne la:{" "}
                <a
                  href="mailto:contact@gobid.ro"
                  className="text-blue-500 hover:underline"
                >
                  contact@gobid.ro
                </a>
              </p>
            </section>
          </article>

          <div
            className={`mt-16 pt-8 border-t ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <p className={isDarkMode ? "text-gray-500 text-sm" : "text-gray-500 text-sm"}>
              Ultima actualizare: document informativ pentru conformitate Google Play Data Safety
              și GDPR.
            </p>
          </div>
        </div>
      </main>

      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
