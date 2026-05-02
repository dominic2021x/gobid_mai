"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface AISearchBarProps {
  placeholder?: string;
  debounceMs?: number;
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return text.split(regex).map((part, idx) =>
    regex.test(part) ? (
      <mark key={`${part}-${idx}`} className="bg-yellow-200 dark:bg-yellow-500/40">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  );
}

export function AISearchBar({
  placeholder = "Caută produse...",
  debounceMs = 350,
}: AISearchBarProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, debounceMs);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      setError(null);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    const runSearch = async () => {
      setIsLoading(true);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: debouncedQuery, topK: 8 }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Eroare la căutare.");
        }

        const payload = (await response.json()) as SearchResult[];
        setResults(payload);
        setIsOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error("AI search error:", err);
        setError(err instanceof Error ? err.message : "Nu am putut efectua căutarea.");
        setResults([]);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    };

    runSearch();
  }, [debouncedQuery]);

  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", listener);
    return () => document.removeEventListener("click", listener);
  }, []);

  const hasResults = results.length > 0;

  return (
    <div className="relative w-full max-w-3xl" ref={containerRef}>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-blue-400 dark:focus-within:ring-blue-900/40">
        <i className="ri-search-line text-lg text-gray-400 dark:text-gray-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => hasResults && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
          aria-label="Căutare AI"
        />
        {isLoading && (
          <i className="ri-loader-4-line animate-spin text-gray-400 dark:text-gray-500" />
        )}
        {query && !isLoading && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            className="rounded-full bg-gray-100 p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Șterge"
          >
            <i className="ri-close-line text-lg" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-30 mt-3 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          {error && (
            <div className="p-4 text-sm text-red-600 dark:text-red-300">{error}</div>
          )}

          {!error && !hasResults && !isLoading && (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Nu am găsit rezultate pentru "{query}".
            </div>
          )}

          {!error && hasResults && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {results.map((result) => {
                const metadata = result.metadata ?? {};
                const title = String(metadata.title ?? "Produs fără titlu");
                const description = String(metadata.description ?? "Descriere indisponibilă.");
                const category = typeof metadata.category === 'string' ? metadata.category : null;

                return (
                  <li
                    key={result.id}
                    className="group cursor-pointer bg-white px-4 py-3 transition hover:bg-blue-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {highlightMatch(title, query)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {highlightMatch(description, query)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      {category && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                          {category}
                        </span>
                      )}
                      <span>
                        Relevanță: {(result.score * 100).toFixed(1)}
                        %
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default AISearchBar;








