"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { ProductForEvaluation, PriceEvaluationResponse } from "@/lib/types/priceEvaluation";
import PriceGauge from "./PriceGauge";
import EvaluationModal from "./EvaluationModal";

/** Stable stringify (sort keys) ca să nu declanșezi reevaluări “aiurea” */
function stableStringify(value: any): string {
  const seen = new WeakSet();
  const sorter = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  const normalize = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return v; // avoid cycles (shouldn't happen)
    seen.add(v);

    if (Array.isArray(v)) return v.map(normalize);
    const keys = Object.keys(v).sort(sorter);
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = normalize(v[k]);
    return out;
  };

  return JSON.stringify(normalize(value));
}

function toNumberSafe(x: any): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    // accept "1 200", "1,200", "1200.50" etc (best-effort)
    const cleaned = x.replace(/\s/g, "").replace(/,/g, ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extrage suprafața din attributes (adaptează cheile după cum ai în proiect) */
function getSurfaceSqm(product: ProductForEvaluation): number | null {
  const attrs: any = product.attributes || {};
  const candidates = [
    attrs.surface,
    attrs.suprafata,
    attrs.suprafata_utila,
    attrs.mp,
    attrs.sqm,
    attrs.area_sqm,
  ];
  for (const c of candidates) {
    const n = toNumberSafe(c);
    if (n && n > 5 && n < 10000) return n;
  }
  return null;
}

interface ProductPriceEvaluationProps {
  product: ProductForEvaluation;
  isDarkMode?: boolean;
  requiresUnlock?: boolean; // New prop to control unlock feature
  /** When true, parent has already unlocked the whole listing (e.g. via main Deblochează button) – evaluare preț se consideră deblocată */
  isUnlockedFromParent?: boolean;
  /** When set, the Deblochează button calls this instead of internal unlock – un singur token deblochează tot anunțul */
  onUnlockRequest?: () => void | Promise<void>;
  userTokens?: number;
  onTokenSpent?: () => void;
  onProductUnlocked?: () => void; // Called when user unlocks (so parent can show other unlocked content)
  /** When true, parent shows "Evaluarea prețului..." on the page; component does not show loading/processing UI */
  showProcessingInComponent?: boolean;
  /** Called when loading or "în curs de procesare" state changes, so page can show message above component */
  onProcessingChange?: (isProcessing: boolean) => void;
}

export default function ProductPriceEvaluation({ 
  product, 
  isDarkMode = false,
  requiresUnlock = false, // Default false = works like before
  isUnlockedFromParent = false,
  onUnlockRequest,
  userTokens = 0,
  onTokenSpent,
  onProductUnlocked,
  showProcessingInComponent = true,
  onProcessingChange,
}: ProductPriceEvaluationProps) {
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<PriceEvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(!requiresUnlock); // Auto-unlocked if not required
  const [unlocking, setUnlocking] = useState(false);
  const [showUnlockOverlay, setShowUnlockOverlay] = useState(false); // după 5–7 s când e blocat

  const effectiveUnlocked = isUnlocked || isUnlockedFromParent;

  // Sync from parent: când pagina a deblocat tot anunțul, considerăm și evaluarea deblocată
  useEffect(() => {
    if (isUnlockedFromParent) setIsUnlocked(true);
  }, [isUnlockedFromParent]);

  // Când e blocat: bara rulează 5–7 s, apoi afișăm overlay-ul cu butonul Deblochează
  useEffect(() => {
    if (!requiresUnlock || effectiveUnlocked) return;
    const t = setTimeout(() => setShowUnlockOverlay(true), 10000); // 10 secunde
    return () => clearTimeout(t);
  }, [requiresUnlock, effectiveUnlocked]);

  // Check if already unlocked on mount (only if unlock is required)
  useEffect(() => {
    if (!requiresUnlock) return; // Skip if unlock not required
    
    try {
      const unlockedKey = `price_eval_unlocked_${product.id}`;
      const wasUnlocked = localStorage.getItem(unlockedKey);
      if (wasUnlocked === 'true') {
        setIsUnlocked(true);
      }
    } catch (e) {
      console.warn('Could not read unlock state from localStorage', e);
    }
  }, [product.id, requiresUnlock]);

  const normalizedProduct = useMemo(() => {
    if (!product) return null;

    const priceNum = toNumberSafe((product as any).price);
    const surfaceSqm = getSurfaceSqm(product);
    const pricePerSqm = priceNum && surfaceSqm ? priceNum / surfaceSqm : null;

    // normalize attributes keys (stable)
    const normalizedAttributes = product.attributes ? JSON.parse(stableStringify(product.attributes)) : product.attributes;

    return {
      ...product,
      price: priceNum ?? product.price, // keep original if null; validation will catch
      attributes: normalizedAttributes,
      // extra hints for backend (poți ignora dacă nu vrei)
      surfaceSqm: surfaceSqm ?? undefined,
      pricePerSqm: pricePerSqm ?? undefined,
    } as any;
  }, [product]);

  const productKey = useMemo(() => {
    if (!normalizedProduct) return "no-product";
    return stableStringify({
      id: normalizedProduct.id,
      title: normalizedProduct.title,
      category: normalizedProduct.category,
      price: normalizedProduct.price,
      currency: normalizedProduct.currency,
      city: normalizedProduct.city,
      area: normalizedProduct.area,
      surfaceSqm: (normalizedProduct as any).surfaceSqm,
      pricePerSqm: (normalizedProduct as any).pricePerSqm,
      attributes: normalizedProduct.attributes,
    });
  }, [normalizedProduct]);

  // Nu porni niciodată evaluarea (API / credite AI) dacă produsul necesită deblocare și nu e deblocat
  const mayRunEvaluation = !requiresUnlock || effectiveUnlocked;

  useEffect(() => {
    if (!mayRunEvaluation) {
      setLoading(false);
      setEvaluation(null);
      setError(null);
      onProcessingChange?.(false);
      return;
    }

    const controller = new AbortController();

    const evaluatePrice = async () => {
      setLoading(true);
      setError(null);
      setEvaluation(null);

      try {
        if (!normalizedProduct) {
          setLoading(false);
          setError("Produsul nu este disponibil.");
          return;
        }

        const priceNum = toNumberSafe((normalizedProduct as any).price);
        if (!normalizedProduct.title || !normalizedProduct.category || !priceNum || priceNum <= 0) {
          setLoading(false);
          setError("Date produs incomplete pentru evaluare.");
          return;
        }

        const response = await fetch("/api/evaluate-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...normalizedProduct,
            price: priceNum, // forțăm number curat
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to evaluate price: ${response.status}`);
        }

        const data = await response.json();
        if (!data.ok) throw new Error(data.error || "Evaluation failed");

        setEvaluation(data);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err.message || "A apărut o eroare la evaluarea prețului.");
      } finally {
        setLoading(false);
      }
    };

    evaluatePrice();
    return () => controller.abort();
  }, [productKey, mayRunEvaluation]);

  const isProcessing = mayRunEvaluation && (loading || (!evaluation && !error));
  useEffect(() => {
    onProcessingChange?.(isProcessing);
  }, [isProcessing, onProcessingChange]);

  const handleUnlock = async () => {
    const supabase = (await import('@/lib/supabase')).default;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
      const loginUrl = currentUrl ? `/auth?mode=login&redirect=${encodeURIComponent(currentUrl)}` : '/auth?mode=login';
      router.push(loginUrl);
      return;
    }

    if (userTokens < 1) {
      alert('Nu ai suficiente token-uri. Ai nevoie de 1 token pentru a debloca evaluarea prețului.');
      return;
    }

    setUnlocking(true);
    try {
      const response = await fetch('/api/tokens/spend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: 1,
          productId: product.id,
          reason: `Evaluare preț pentru produsul ${product.id}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Nu am putut procesa token-ul');
      }

      setIsUnlocked(true);
      if (onTokenSpent) onTokenSpent();
      if (onProductUnlocked) onProductUnlocked();

      try {
        const unlockedKey = `price_eval_unlocked_${product.id}`;
        localStorage.setItem(unlockedKey, 'true');
      } catch (e) {
        console.warn('Could not save unlock state to localStorage', e);
      }
    } catch (err) {
      console.error('Error unlocking price evaluation:', err);
      alert(err instanceof Error ? err.message : 'A apărut o eroare. Te rugăm să încerci din nou.');
    } finally {
      setUnlocking(false);
    }
  };

  // Produs blocat: bara rulează 5–7 s, apoi apare blur + buton Deblochează; fără API / credite AI
  if (requiresUnlock && !effectiveUnlocked) {
    return (
      <div className={`price-evaluation-box relative ${isDarkMode ? "bg-gray-800" : "bg-white"} border ${isDarkMode ? "border-gray-700" : "border-gray-200"} rounded-lg p-4 overflow-hidden`}>
        <div className="flex items-center gap-2 mb-3">
          <InformationCircleIcon className={`w-5 h-5 flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
          <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Evaluarea prețului este în curs de procesare...</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex-1 h-4 rounded-sm price-loader-bar ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}
              style={{
                animationName: isDarkMode ? "priceLoaderFillDark" : "priceLoaderFill",
                animationDuration: "2.5s",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
        {showUnlockOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px]">
            <button
              onClick={async () => {
                if (onUnlockRequest) {
                  setUnlocking(true);
                  try {
                    await onUnlockRequest();
                  } finally {
                    setUnlocking(false);
                  }
                } else {
                  await handleUnlock();
                }
              }}
              disabled={unlocking}
              className={`hidden px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 items-center gap-2 ${
                unlocking ? "opacity-50 cursor-wait bg-yellow-500 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg"
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
              <span>{unlocking ? "Se deblochează..." : "1 Token - Deblochează"}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Loading/processing: afișăm mereu grafica în interiorul boxului (nu placeholder gol)
  if (loading || (isProcessing && !evaluation && !error)) {
    return (
      <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} border-0 rounded-lg p-0`}>
        <div className={`flex items-center gap-2 mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          <InformationCircleIcon className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">Evaluarea prețului este în curs de procesare...</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex-1 h-4 rounded-sm price-loader-bar ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}
              style={{
                animationName: isDarkMode ? "priceLoaderFillDark" : "priceLoaderFill",
                animationDuration: "2.5s",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${isDarkMode ? "bg-red-900/20 border-red-700" : "bg-red-50 border-red-200"} border rounded-lg p-4`}>
        <p className={`${isDarkMode ? "text-red-400" : "text-red-700"} text-sm mb-3`}>{error}</p>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} border ${isDarkMode ? "border-gray-700" : "border-gray-200"} rounded-lg p-4`}>
        <div className={`flex items-center gap-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          <InformationCircleIcon className="w-5 h-5" />
          <p className="text-sm">Evaluarea prețului este în curs de procesare...</p>
        </div>
      </div>
    );
  }

  if (evaluation.noEvaluation) {
    return (
      <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} border ${isDarkMode ? "border-gray-700" : "border-gray-200"} rounded-lg p-4`}>
        <div className={`flex items-center gap-2 mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          <InformationCircleIcon className="w-5 h-5" />
          <p className="text-sm">Nu există suficiente date pentru o evaluare realistă a prețului.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`price-evaluation-box relative ${isDarkMode ? "bg-gray-800" : "bg-white"} border ${isDarkMode ? "border-gray-700" : "border-gray-200"} rounded-lg p-4 overflow-hidden`}>
        {/* Content - with blur if locked and unlock required (tentă vizibilă) */}
        <div className={`flex items-start justify-between gap-4 ${requiresUnlock && !effectiveUnlocked ? 'filter blur-[2px] pointer-events-none bg-yellow-400/15 rounded' : ''}`}>
          <div className="flex-1">
            <PriceGauge
              level={evaluation.level}
              price={evaluation.priceDisplay ?? evaluation.product.price}
              currency={evaluation.displayCurrency ?? evaluation.product.currency}
              compact={false}
              isDarkMode={isDarkMode}
            />
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className={`p-2 ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"} rounded-lg transition flex-shrink-0`}
            title="Detalii evaluare"
          >
            <InformationCircleIcon className={`w-7 h-7 ${isDarkMode ? "text-gray-400 hover:text-yellow-400" : "text-gray-600 hover:text-yellow-500"} transition-colors`} />
          </button>
        </div>

        {/* Unlock overlay - only show if unlock is required and not unlocked */}
        {requiresUnlock && !effectiveUnlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px]">
            <button
              onClick={handleUnlock}
              disabled={unlocking}
              className={`hidden px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 items-center gap-2 ${
                unlocking ? 'opacity-50 cursor-wait bg-yellow-500 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
              <span>{unlocking ? 'Se deblochează...' : '1 Token - Deblochează'}</span>
            </button>
          </div>
        )}
      </div>

      <EvaluationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={evaluation.product}
        ranges={evaluation.ranges}
        level={evaluation.level}
        aiExplanation={evaluation.aiExplanation}
        stats={{
          minPrice: evaluation.minPrice,
          maxPrice: evaluation.maxPrice,
          avgPrice: evaluation.avgPrice,
          samplesCount: evaluation.samplesCount,
        }}
        displayCurrency={evaluation.displayCurrency}
        priceDisplay={evaluation.priceDisplay}
        isDarkMode={isDarkMode}
      />
    </>
  );
}
