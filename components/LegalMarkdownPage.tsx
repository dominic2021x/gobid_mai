"use client";

import { useState, useEffect } from "react";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import Link from "next/link";

interface LegalMarkdownPageProps {
  title: string;
  html: string;
  description?: string;
}

const contactBoxDark = "rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 shadow-2xl";
const contactBoxLight = "rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-2xl";
const linkDark = "text-blue-300 hover:text-blue-200 hover:underline";
const linkLight = "text-blue-600 hover:text-blue-700 hover:underline";

export default function LegalMarkdownPage({
  title,
  html,
  description,
}: LegalMarkdownPageProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  const prose = isDarkMode
    ? "prose-invert prose-headings:text-white prose-p:text-white/80 prose-li:text-white/80 prose-strong:text-white prose-a:text-blue-300 prose-a:hover:text-blue-200"
    : "prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-blue-600 prose-a:hover:text-blue-700";

  if (!mounted) return null;

  const contactCls = isDarkMode ? contactBoxDark : contactBoxLight;
  const linkCls = isDarkMode ? linkDark : linkLight;

  return (
    <div
      className={
        isDarkMode
          ? "min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white transition-all duration-300"
          : "min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 text-gray-900 transition-all duration-300"
      }
    >
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />

      <main className="px-6 pb-20 pt-28 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl space-y-8">
          <header className="space-y-4 text-center">
            <span
              className={
                isDarkMode
                  ? "inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200"
                  : "inline-flex items-center justify-center rounded-full border border-blue-200 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600"
              }
            >
              Document legal
            </span>
            <h1
              className={
                isDarkMode ? "text-3xl font-extrabold leading-tight text-white sm:text-4xl" : "text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl"
              }
            >
              {title}
            </h1>
            {description && (
              <p
                className={
                  isDarkMode ? "mx-auto max-w-2xl text-sm text-white/70 sm:text-base" : "mx-auto max-w-2xl text-sm text-gray-600 sm:text-base"
                }
              >
                {description}
              </p>
            )}
          </header>

          <article
            className={
              isDarkMode
                ? "prose prose-lg max-w-none rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-8 " + prose
                : "prose prose-lg max-w-none rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8 " + prose
            }
          >
            <div
              className="legal-content [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_li]:leading-relaxed [&_table]:my-4 [&_table]:min-w-full [&_table]:border-collapse [&_th]:border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:px-4 [&_td]:py-2 [&_hr]:my-6 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:underline [&_a:hover]:no-underline"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>

          <div className={contactCls}>
            <p>
              Pentru întrebări: <a href="mailto:legal@gobid.ro" className={linkCls}>legal@gobid.ro</a> sau <Link href="/contact" className={linkCls}>formularul de contact</Link>.
            </p>
          </div>
        </div>
      </main>

      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
