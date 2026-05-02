"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";

export default function TermeniSiConditiiPage() {
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

  if (!mounted) {
    return null;
  }

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className={`mb-6 flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            isDarkMode 
              ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700' 
              : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 shadow-sm'
          }`}
        >
          <i className="ri-arrow-left-line"></i>
          <span>Înapoi</span>
        </button>

        {/* Content */}
        <div className={`rounded-xl p-6 sm:p-8 md:p-10 shadow-xl ${
          isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <h1 className={`text-3xl sm:text-4xl font-bold mb-6 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Termeni și Condiții
          </h1>

          <div className={`prose prose-lg max-w-none ${
            isDarkMode ? 'prose-invert' : ''
          }`}>
            <p className={`text-sm sm:text-base leading-relaxed mb-6 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Ultima actualizare: {new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                1. Prezentare Generală
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Bine ați venit pe gobid.ro! Prin accesarea și utilizarea acestui site web, acceptați să respectați și să fiți legați de următorii termeni și condiții de utilizare. Dacă nu sunteți de acord cu oricare dintre aceste termeni, vă rugăm să nu utilizați serviciile noastre.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                2. Definiții
              </h2>
              <ul className={`list-disc list-inside space-y-2 text-sm sm:text-base leading-relaxed ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li><strong>Platformă</strong>: referă la site-ul web gobid.ro și toate funcționalitățile sale</li>
                <li><strong>Utilizator</strong>: orice persoană care accesează sau utilizează platforma</li>
                <li><strong>Licitație</strong>: procesul de licitare pentru produsele disponibile pe platformă</li>
                <li><strong>Vânzător</strong>: utilizator care oferă produse pentru licitație</li>
                <li><strong>Cumpărător</strong>: utilizator care participă la licitații</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                3. Eligibilitate
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Pentru a utiliza serviciile gobid.ro, trebuie să aveți minim 18 ani și să aveți capacitatea legală de a încheia contracte juridic obligatorii. Prin înregistrare, declarați și garantați că îndepliniți aceste cerințe.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                4. Contul Utilizatorului
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Sunteți responsabil pentru menținerea confidențialității informațiilor contului dvs. și pentru toate activitățile care au loc sub contul dvs. Ne rezervăm dreptul de a suspenda sau închide contul oricărui utilizator care încalcă acești termeni.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                5. Licitații
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Ofertele de licitare sunt obligatorii legal. Dacă câștigați o licitație, sunteți obligat să finalizați tranzacția. Refuzul de a finaliza o tranzacție câștigată poate rezulta în suspendarea sau închiderea contului.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                6. Platforma ca Intermediar
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                gobid.ro acționează ca intermediar între vânzători și cumpărători. Nu suntem parte la contractul de vânzare-cumpărare și nu garantăm calitatea, autenticitatea sau legalitatea produselor listate.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                7. Limitarea Răspunderii
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                gobid.ro nu va fi răspunzător pentru daune directe, indirecte, incidente sau consecvente rezultate din utilizarea sau imposibilitatea utilizării platformei noastre.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                8. Modificări ale Termenilor
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Ne rezervăm dreptul de a modifica acești termeni și condiții în orice moment. Modificările vor intra în vigoare imediat după publicarea pe platformă. Utilizarea continuă a serviciilor după modificări constituie acceptarea termenilor actualizați.
              </p>
            </section>

            <section className="mb-8">
              <h2 className={`text-xl sm:text-2xl font-semibold mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                9. Contact
              </h2>
              <p className={`text-sm sm:text-base leading-relaxed mb-4 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Pentru întrebări sau clarificări referitoare la acești termeni și condiții, vă rugăm să ne contactați prin intermediul funcționalității de contact disponibilă pe platformă.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
