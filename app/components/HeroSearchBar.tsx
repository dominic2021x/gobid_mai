"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSearchSuggestions, type SearchSuggestionsContext } from "@/lib/search/useSearchSuggestions";
import type { PopularSuggestionItem } from "@/lib/search/usePopularSuggestions";
import { writeSearchHistory } from "@/lib/search/sessionHistory";

export type HeroSearchBarProps = {
  isDarkMode?: boolean;
  /** "hero" = pe fundal slider (text alb), "standalone" = deasupra conținutului (urmează tema) */
  variant?: "hero" | "standalone";
  className?: string;
  /** Folosește sugestii RO mix (3 personale + 7 globale); la submit: writeSearchHistory + POST track */
  useRoSuggestions?: boolean;
  accessToken?: string | null;
  context?: SearchSuggestionsContext | null;
  /** Sugestii „Căutări recente” / „Căutări frecvente” transmise din header */
  popularSuggestions?: PopularSuggestionItem[];
  /** Apelat când userul selectează o sugestie (închide panoul de search în header) */
  onSuggestionSelect?: () => void;
};

export default function HeroSearchBar({
  isDarkMode = false,
  variant = "hero",
  className = "",
  useRoSuggestions = false,
  accessToken = null,
  context = null,
  popularSuggestions: _popularSuggestions = [],
  onSuggestionSelect,
}: HeroSearchBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [heroSearchPlaceholder, setHeroSearchPlaceholder] = useState("");
  const heroSearchPlaceholderFullText = "Căutare rapidă...";
  const [isImageSearching, setIsImageSearching] = useState(false);
  const imageSearchInputRef = useRef<HTMLInputElement>(null);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<{ stop(): void } | null>(null);
  const [toastModal, setToastModal] = useState<{ title: string; message: string } | null>(null);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [subcategories, setSubcategories] = useState<Array<{ display: string; q: string; brand?: string; category?: string; subcategory?: string }>>([]);
  const [suggestions, setSuggestions] = useState<Array<string | { display: string; q: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; title: string; image?: string; price?: number; category?: string; url?: string }>>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Poziție pentru dropdown portalat (standalone), ca să apară deasupra conținutului paginii */
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const { items: roItems, loading: roLoading } = useSearchSuggestions(
    searchQuery,
    context,
    accessToken,
    140
  );

  const TRENDING_LIST = [
    "Apartamente",
    "Autoturisme",
    "Piese auto",
    "Terenuri",
    "Spațiu comercial",
    "iPhone",
    "Laptop",
    "Mobilier",
  ];

  const fetchSuggestions = useCallback(async (query: string) => {
    const q = (query || "").trim();
    if (!q) {
      setSubcategories([]);
      setSuggestions([]);
      setProducts([]);
      setShowSuggestions(false);
      return;
    }
    if (q.length < 2) {
      setSubcategories([]);
      setSuggestions(TRENDING_LIST);
      setProducts([]);
      setShowSuggestions(true);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    try {
      const response = await fetch(
        `/api/search/suggestions?q=${encodeURIComponent(q)}&limit=10`,
        { signal }
      );
      const data = await response.json();
      if (signal.aborted) return;
      setSubcategories(Array.isArray(data.subcategories) ? data.subcategories : []);
      const raw = data.suggestions ?? [];
      setSuggestions(Array.isArray(raw) && raw.length > 0 ? raw : []);
      setProducts(Array.isArray(data.products) && data.products.length > 0 ? data.products : []);
      const hasAny =
        (data.subcategories?.length > 0) || (Array.isArray(raw) && raw.length > 0) || (data.products?.length > 0);
      setShowSuggestions(!!hasAny);
    } catch (e) {
      if (signal.aborted) return;
      console.error("HeroSearchBar suggestions error:", e);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (useRoSuggestions) {
      const hasRo = roItems.length > 0;
      setShowSuggestions(hasRo);
      return;
    }
    const q = searchQuery.trim();
    if (q.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(q), 140);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    } else if (q.length === 1) {
      setSubcategories([]);
      setSuggestions(TRENDING_LIST);
      setProducts([]);
      setShowSuggestions(true);
    } else {
      setSubcategories([]);
      setSuggestions([]);
      setProducts([]);
      setShowSuggestions(false);
    }
  }, [useRoSuggestions, searchQuery, roItems.length, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (suggestionsRef.current && !suggestionsRef.current.contains(target) && !target.closest("[data-hero-search-suggestions]")) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isStandalone = variant === "standalone";
  useLayoutEffect(() => {
    if (!showSuggestions || !isStandalone) {
      setDropdownRect(null);
      return;
    }
    const el = suggestionsRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 8, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showSuggestions, isStandalone]);

  // Placeholder care se scrie singur când câmpul e gol – max 2 cicluri, apoi rămâne blocat
  useEffect(() => {
    if (searchQuery !== "") {
      setHeroSearchPlaceholder("");
      return;
    }
    const fullText = heroSearchPlaceholderFullText;
    let index = 0;
    let cycleCount = 0;
    const maxCycles = 2;
    let timeoutId: ReturnType<typeof setTimeout>;
    const typeNext = () => {
      if (index <= fullText.length) {
        setHeroSearchPlaceholder(fullText.slice(0, index));
        index += 1;
        timeoutId = setTimeout(typeNext, 85);
      } else {
        cycleCount += 1;
        if (cycleCount >= maxCycles) {
          setHeroSearchPlaceholder(fullText);
          return;
        }
        timeoutId = setTimeout(() => {
          index = 0;
          typeNext();
        }, 1800);
      }
    };
    typeNext();
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const applySuggestion = useCallback(
    (item: string | { display: string; q: string }) => {
      setShowSuggestions(false);
      onSuggestionSelect?.();
      const q = typeof item === "string" ? item : item.q;
      if (q) {
        setSearchQuery(q);
        router.push(`/ro?q=${encodeURIComponent(q)}`);
      }
    },
    [router, onSuggestionSelect]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (useRoSuggestions) {
      writeSearchHistory(q);
      fetch("/api/ro/search/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }).catch(() => {});
    }
    router.push(`/ro?q=${encodeURIComponent(q)}`);
    setShowSuggestions(false);
  };

  const handleImageSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToastModal({ title: "Imagine invalidă", message: "Vă rugăm să selectați o imagine validă." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToastModal({ title: "Fișier prea mare", message: "Imaginea este prea mare. Dimensiunea maximă este 10MB." });
      return;
    }
    setIsImageSearching(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const searchResponse = await fetch("/api/search/image", { method: "POST", body: formData });
      const searchResult = await searchResponse.json();
      if (!searchResponse.ok || searchResult.error) {
        throw new Error(searchResult.message || searchResult.error || "Search failed");
      }
      sessionStorage.setItem("imageSearchResults", JSON.stringify(searchResult));
      window.location.href = "/ro?imageSearch=true";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Eroare la căutarea după imagine";
      console.error("Error searching image:", err);
      sessionStorage.setItem("imageSearchError", message);
      window.location.href = "/ro?imageSearch=true";
    }
    e.target.value = "";
    setIsImageSearching(false);
  };

  const toggleDictation = () => {
    if (typeof window === "undefined") return;
    if (isDictating && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isFirefox = typeof navigator !== "undefined" && /Firefox/i.test(navigator.userAgent);
    if (!SpeechAPI) {
      setToastModal({
        title: "Dictare vocală",
        message: isFirefox
          ? "Dictarea vocală nu este suportată în Firefox. Folosește Chrome, Edge sau Safari pentru căutare vocală."
          : "Dictarea vocală nu este suportată în acest browser. Încearcă Chrome, Edge sau Safari.",
      });
      return;
    }
    const recognition = new SpeechAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "ro-RO";
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0]?.transcript)
        .filter(Boolean)
        .join(" ")
        .trim();
      if (transcript) setSearchQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => {
      setIsDictating(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (e: any) => {
      setIsDictating(false);
      recognitionRef.current = null;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setToastModal({
          title: "Microfon",
          message: "Permisiune microfon refuzată. Activează microfonul în setările browserului pentru dictare.",
        });
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        console.warn("Speech recognition error:", e.error);
      }
    };
    recognitionRef.current = recognition;
    const startRecognition = () => {
      try {
        recognition.start();
        setIsDictating(true);
      } catch (err) {
        setIsDictating(false);
        recognitionRef.current = null;
        console.warn("recognition.start failed:", err);
      }
    };
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => startRecognition())
        .catch(() => {
          setToastModal({
            title: "Microfon",
            message: "Pentru dictare, acordă permisiunea pentru microfon când browserul o solicită.",
          });
        });
    } else {
      startRecognition();
    }
  };

  const isHero = variant === "hero";
  const darkMode = isHero ? true : isDarkMode;

  const inputWrapperClass = isHero
    ? "bg-white/10 backdrop-blur-md border border-white shadow-lg"
    : darkMode
      ? "bg-gray-800 border border-gray-600 shadow-lg"
      : "bg-white border border-gray-200 shadow-lg";
  const inputTextClass = isHero
    ? "text-white placeholder-white/50"
    : darkMode
      ? "text-white placeholder-gray-400"
      : "text-gray-900 placeholder-gray-500";
  const buttonBaseClass = isHero
    ? "text-white/80 hover:bg-white/20 hover:text-white"
    : darkMode
      ? "text-gray-300 hover:bg-gray-700 hover:text-white"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
  const buttonMicClass = isDictating ? "bg-red-500/80 text-white" : buttonBaseClass;
  const buttonSubmitClass = isHero
    ? "bg-white/20 hover:bg-white/30 text-white"
    : "bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white shadow-inner";

  const hasAny = useRoSuggestions ? roItems.length > 0 : subcategories.length > 0 || suggestions.length > 0;
  const personalItems = useRoSuggestions ? roItems.filter((i) => i.source === "personal") : [];
  const globalItems = useRoSuggestions ? roItems.filter((i) => i.source === "global") : [];

  return (
    <div ref={suggestionsRef} className={`relative w-full max-w-lg ${className}`}>
      <form onSubmit={handleSearch} className="w-full">
        <div className={`relative flex rounded-full overflow-hidden ${inputWrapperClass}`}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchQuery.length >= 2 && hasAny) setShowSuggestions(true);
            }}
            placeholder={heroSearchPlaceholder || heroSearchPlaceholderFullText}
            className={`w-full py-3 sm:py-3.5 ${!isHero ? "pl-14 sm:pl-14 pr-[7.5rem] sm:pr-40" : "pl-5 pr-[7.5rem] sm:pr-40"} text-base sm:text-lg bg-transparent focus:outline-none focus:ring-0 ${inputTextClass}`}
            aria-label="Căutare"
            autoComplete="off"
          />
          <input
            ref={imageSearchInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSearchChange}
            aria-label="Căutare după imagine"
          />
          {!isHero && (
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center">
              <button
                type="submit"
                className={`p-2 sm:p-2.5 rounded-full transition-colors ${buttonSubmitClass}`}
                aria-label="Caută"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          )}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => imageSearchInputRef.current?.click()}
              disabled={isImageSearching}
              className={`p-2 sm:p-2.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-wait ${buttonBaseClass}`}
              title="Căutare după imagine"
              aria-label="Căutare după imagine"
            >
              {isImageSearching ? (
                <span className="block w-5 h-5 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-5 sm:h-5">
                  <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3.5" />
                  <path d="M19 13v3a2 2 0 01-2 2H7a2 2 0 01-2-2v-3" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={toggleDictation}
              className={`p-2 sm:p-2.5 rounded-full transition-colors ${buttonMicClass}`}
              title={isDictating ? "Oprește dictarea" : "Dictare vocală"}
              aria-label={isDictating ? "Oprește dictarea" : "Dictare vocală"}
            >
              {isDictating ? (
                <span className="block w-5 h-5 sm:w-5 sm:h-5 rounded-full bg-current opacity-90 animate-pulse" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 sm:w-5 sm:h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
            {isHero && (
              <button
                type="submit"
                className={`p-2 sm:p-2.5 rounded-full transition-colors ${buttonSubmitClass}`}
                aria-label="Caută"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </form>

      {showSuggestions && (useRoSuggestions ? (searchQuery.length >= 0 && hasAny) : searchQuery.length >= 2 && hasAny) && (() => {
        const suggestionContent = (
          <div className="overflow-y-auto max-h-[420px] p-2">
            {useRoSuggestions && (
              <>
                {personalItems.length > 0 && (
                  <>
                    <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${darkMode ? "text-white/70" : "text-gray-600"}`}>Pentru tine</div>
                    <div className="space-y-0.5">
                      {personalItems.map((item, i) => (
                        <button key={`pers-${i}`} type="button" onClick={() => applySuggestion({ display: item.phrase, q: item.phrase })} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-100"}`}>
                          {item.phrase}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {(personalItems.length > 0 ? globalItems : roItems).length > 0 && (
                  <>
                    <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${darkMode ? "text-white/70" : "text-gray-600"}`}>Sugestii</div>
                    <div className="space-y-0.5">
                      {(personalItems.length > 0 ? globalItems : roItems).map((item, i) => (
                        <button key={`sug-${i}`} type="button" onClick={() => applySuggestion({ display: item.phrase, q: item.phrase })} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-100"}`}>
                          {item.phrase}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {roLoading && (
                  <div className={`px-3 py-2 text-sm ${darkMode ? "text-white/60" : "text-gray-500"}`}>Se încarcă...</div>
                )}
              </>
            )}
            {!useRoSuggestions && subcategories.length > 0 && (
              <>
                <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${darkMode ? "text-white/70" : "text-gray-600"}`}>Sugestii rapide</div>
                <div className="space-y-0.5">
                  {subcategories.map((s, i) => (
                    <button key={`sub-${i}`} type="button" onClick={() => applySuggestion(s)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-100"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="block">{s.display}</span>
                          {(s.category || s.subcategory) && (
                            <span className={`block text-xs mt-0.5 ${darkMode ? "text-white/60" : "text-gray-500"}`}>
                              {[s.category, s.subcategory].filter(Boolean).join(" / ")}
                            </span>
                          )}
                        </div>
                        {s.brand && (
                          <span className={`flex-shrink-0 text-xs font-medium ${darkMode ? "text-white/70" : "text-gray-600"}`}>
                            {s.brand}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!useRoSuggestions && subcategories.length === 0 && suggestions.length > 0 && (
              <>
                <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${darkMode ? "text-white/70" : "text-gray-600"}`}>Sugestii</div>
                <div className="space-y-0.5">
                  {suggestions.map((suggestion, index) => {
                    const item = typeof suggestion === "string" ? { display: suggestion, q: suggestion } : suggestion;
                    return (
                      <button key={`sug-${index}`} type="button" onClick={() => applySuggestion(item)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-100"}`}>
                        {item.display}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
        const dropdownClass = `rounded-2xl shadow-2xl max-h-[min(420px,calc(100dvh-12rem))] overflow-hidden backdrop-blur-xl ${darkMode ? "bg-gray-900/95 border border-white/20" : "bg-white/98 border border-gray-200"}`;
        if (isStandalone && dropdownRect && typeof document !== "undefined") {
          return createPortal(
            <div
              className={dropdownClass}
              style={{
                position: "fixed",
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
                zIndex: 100002,
              }}
              data-hero-search-suggestions
            >
              {suggestionContent}
            </div>,
            document.body
          );
        }
        return (
          <div className={`absolute top-full left-0 right-0 mt-2 z-[100002] ${dropdownClass}`}>
            {suggestionContent}
          </div>
        );
      })()}

      {/* Modal notificare – design modern transparent */}
      {toastModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="toast-modal-title"
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setToastModal(null)}
            aria-hidden="true"
          />
          <div
            className={`relative w-full max-w-sm rounded-2xl border shadow-2xl transition-all ${
              darkMode
                ? "border-white/20 bg-gray-900/80 backdrop-blur-xl text-white"
                : "border-white/40 bg-white/80 backdrop-blur-xl text-gray-900"
            }`}
          >
            <div className="p-6">
              <h3
                id="toast-modal-title"
                className={`text-lg font-semibold mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                {toastModal.title}
              </h3>
              <p className={`text-sm leading-relaxed ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                {toastModal.message}
              </p>
              <button
                type="button"
                onClick={() => setToastModal(null)}
                className={`mt-5 w-full rounded-xl py-2.5 text-sm font-medium transition-all ${
                  darkMode
                    ? "bg-white/20 hover:bg-white/30 text-white"
                    : "bg-gray-900/10 hover:bg-gray-900/20 text-gray-900"
                }`}
              >
                Înțeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
