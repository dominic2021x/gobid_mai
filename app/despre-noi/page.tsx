"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";

const milestones = [
  {
    year: "Astăzi",
    title: "Platforma gobid.ro",
    description:
      "O platformă românească de licitații online: listări transparente, oferte clare și un flux simplu de la descoperire la câștig."
  },
  {
    year: "Obiectiv",
    title: "Transparență și acces",
    description:
      "Ne propunem să oferim oricui acces la licitații în condiții egale, cu costuri afișate clar și reguli ușor de înțeles."
  },
  {
    year: "Direcție",
    title: "Îmbunătățire continuă",
    description:
      "Lucrăm zilnic la performanță, securitate și noi funcționalități, pe baza feedback-ului utilizatorilor și al cerințelor pieței."
  },
  {
    year: "Viziune",
    title: "Licitații pentru toți",
    description:
      "Să facem licitațiile accesibile și sigure pentru cumpărători din toată țara, cu suport în limba română și plăți în Lei."
  }
];

const values = [
  {
    title: "Transparență",
    description:
      "Afișăm informațiile relevante pentru fiecare licitație și păstrăm istoricul ofertelor, astfel încât deciziile să fie informate."
  },
  {
    title: "Simplitate",
    description:
      "Interfața și fluxurile sunt gândite să fie ușor de folosit, fără pași inutili, cu focus pe experiența cumpărătorului."
  },
  {
    title: "Securitate",
    description:
      "Luăm în serios protecția datelor și a tranzacțiilor: conexiuni securizate, autentificare și bune practici de developement."
  },
  {
    title: "Orientare spre rezultat",
    description:
      "Prioritatea noastră este ca utilizatorii să găsească licitații relevante și să poată participa fără fricțiuni."
  }
];

export default function AboutPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [logoError, setLogoError] = useState(false);

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

  const handleToggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white' 
        : 'bg-gradient-to-b from-gray-50 via-white to-gray-50 text-gray-900'
    }`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={handleToggleDarkMode} />

      <main className="px-6 pb-20 pt-28 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl space-y-16">
          {/* Hero */}
          <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                isDarkMode 
                  ? 'border-white/20 text-blue-200' 
                  : 'border-blue-200 text-blue-600'
              }`}>
                Despre gobid.ro 
              </span>
              <h1 className={`text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                gobid.ro – platforma ta de licitații online
              </h1>
              <p className={`max-w-2xl text-base sm:text-lg ${
                isDarkMode ? 'text-white/80' : 'text-gray-600'
              }`}>
                gobid.ro este o platformă 100% românească pentru licitații: găsești listări clare, poți plasa oferte în siguranță și urmărești rezultatele. Echipa noastră lucrează la îmbunătățirea continuă a serviciului și la transparența ofertelor.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className={`rounded-2xl border px-4 py-3 ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/70' 
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}>
                  Licitații din toată țara
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/70' 
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}>
                  Oferte și reguli transparente
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/70' 
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}>
                  Suport în limba română
                </div>
              </div>
            </div>

            <div className={`relative h-80 w-full overflow-hidden rounded-3xl border shadow-2xl ${
              isDarkMode 
                ? 'border-white/10 bg-white/5' 
                : 'border-gray-200 bg-gray-50'
            }`}>
              <Image
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80"
                alt="Echipa gobid.ro"
                fill
                className="object-cover"
                priority
              />
              <div className={`absolute inset-0 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-blue-900/40 via-slate-900/50 to-slate-950/60' 
                  : 'bg-gradient-to-br from-blue-900/20 via-slate-900/20 to-slate-950/30'
              }`} />
              <div className={`absolute bottom-5 left-5 right-5 rounded-2xl p-4 backdrop-blur ${
                isDarkMode 
                  ? 'bg-white/15' 
                  : 'bg-white/80'
              }`}>
                <p className={`text-sm font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Echipa gobid.ro</p>
                <p className={`mt-2 text-xs ${
                  isDarkMode ? 'text-white/80' : 'text-gray-600'
                }`}>
                  Lucrăm zilnic la platformă și la suportul utilizatorilor.
                </p>
              </div>
            </div>
          </section>

          {/* Milestones */}
          <section className="space-y-6">
            <h2 className={`text-2xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Cum gândim</h2>
            <div className="grid gap-6 lg:grid-cols-4">
              {milestones.map((item) => (
                <div key={item.year} className={`rounded-3xl border p-6 shadow-xl ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5' 
                    : 'border-gray-200 bg-white'
                }`}>
                  <span className={`text-sm font-semibold ${
                    isDarkMode ? 'text-blue-200' : 'text-blue-600'
                  }`}>{item.year}</span>
                  <h3 className={`mt-3 text-lg font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{item.title}</h3>
                  <p className={`mt-2 text-sm ${
                    isDarkMode ? 'text-white/70' : 'text-gray-600'
                  }`}>{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Values */}
          <section className="space-y-6">
            <h2 className={`text-2xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Valorile noastre</h2>
            <div className="grid gap-6 lg:grid-cols-4">
              {values.map((value) => (
                <div key={value.title} className={`rounded-3xl border p-6 shadow-xl ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5' 
                    : 'border-gray-200 bg-white'
                }`}>
                  <h3 className={`text-lg font-semibold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{value.title}</h3>
                  <p className={`mt-2 text-sm ${
                    isDarkMode ? 'text-white/70' : 'text-gray-600'
                  }`}>{value.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Feedback */}
          <section className="space-y-6">
            <h2 className={`text-2xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Feedback-ul vostru contează</h2>
            <div className={`rounded-3xl border p-6 shadow-xl ${
              isDarkMode 
                ? 'border-white/10 bg-white/5' 
                : 'border-gray-200 bg-white'
            }`}>
              <p className={`text-sm ${
                isDarkMode ? 'text-white/80' : 'text-gray-600'
              }`}>
                Îmbunătățim constant platforma pe baza sugestiilor și experienței utilizatorilor. Dacă ai întrebări, probleme sau idei, ne poți contacta oricând – răspundem la fiecare mesaj.
              </p>
              <a
                href="/contact"
                className={`mt-4 inline-block text-sm font-semibold ${
                  isDarkMode ? 'text-blue-200 hover:text-blue-100' : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                Pagina de contact →
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className={`rounded-3xl border p-8 shadow-2xl ${
            isDarkMode 
              ? 'border-white/10 bg-white/5' 
              : 'border-gray-200 bg-white'
          }`}>
            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
              <div className="space-y-4">
                <h2 className={`text-2xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Vrei să colaborezi cu noi?</h2>
                <p className={`text-sm ${
                  isDarkMode ? 'text-white/70' : 'text-gray-600'
                }`}>
                  gobid.ro oferă licitații online pentru cumpărători și vânzători. Pentru parteneriate, colaborări B2B sau întrebări despre platformă, scrie-ne la partners@gobid.ro.
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    href="mailto:partners@gobid.ro"
                    className="rounded-xl bg-blue-600 px-5 py-3 font-semibold uppercase tracking-wide text-white shadow-lg shadow-blue-600/40 transition hover:bg-blue-500"
                  >
                    Contactează-ne
                  </a>
                  <a
                    href="/contact"
                    className={`rounded-xl border px-5 py-3 font-semibold uppercase tracking-wide transition ${
                      isDarkMode 
                        ? 'border-white/20 text-white hover:border-white/40 hover:bg-white/10' 
                        : 'border-gray-300 text-gray-900 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    Pagina de contact
                  </a>
                </div>
              </div>

              <div className="relative h-60 w-full overflow-hidden rounded-3xl">
                <Image
                  src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80"
                  alt="Colaborare gobid.ro"
                  fill
                  className="object-cover"
                />
                <div className={`absolute inset-0 ${
                  isDarkMode 
                    ? 'bg-gradient-to-br from-blue-900/40 via-slate-900/40 to-slate-950/60' 
                    : 'bg-gradient-to-br from-blue-900/20 via-slate-900/20 to-slate-950/30'
                }`} />
                <div className={`absolute bottom-4 left-4 right-4 rounded-2xl p-4 backdrop-blur ${
                  isDarkMode 
                    ? 'bg-white/15' 
                    : 'bg-white/80'
                }`}>
                  <p className={`text-xs ${
                    isDarkMode ? 'text-white/80' : 'text-gray-600'
                  }`}>
                    Suntem deschiși la discuții cu parteneri și instituții care doresc să folosească sau să integreze gobid.ro.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>

    </div>
  );
}
