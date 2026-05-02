"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface AIConfig {
  autoIndexEnabled: boolean;
  autoIndexMode: "live" | "delayed"; // live sau delayed (20 min)
  scheduledScanEnabled: boolean;
  scheduledScanTime: string; // "02:00", "03:00", etc.
  lastScanDate: string | null;
  lastScanCount: number;
  suggestionsEnabled: boolean;
  autoSuggestions: boolean;
}

interface AIResponseConfig {
  style: "formal" | "casual" | "friendly" | "professional";
  systemPrompt: string;
  voicePatterns: {
    enabled: boolean;
    pausesProbability: number;
    hesitationsProbability: number;
    connectorsEnabled: boolean;
  };
  customResponses: Array<{
    id: string;
    pattern: string;
    response: string;
    enabled: boolean;
  }>;
  templates: {
    greeting: string;
    thanks: string;
    noResults: string;
    tokenBlocked: string;
    followUp: string;
  };
  welcomeMessage: {
    enabled: boolean;
    message: string;
    initialDelay: number; // ms
    typingDelay: number; // ms
  };
}

interface AIScanLog {
  id: string;
  type: "products" | "categories" | "full";
  status: "running" | "completed" | "error";
  startTime: string;
  endTime?: string;
  itemsScanned: number;
  error?: string;
}

const DEFAULT_RESPONSE_CONFIG: AIResponseConfig = {
  style: "friendly",
  systemPrompt: `Ești un asistent virtual pentru platforma de licitații gobid.ro.
Răspunde în limba română, fiind util, prietenos și concis.
Folosește DOAR informațiile din contextul furnizat pentru a răspunde.
Dacă contextul nu conține informații relevante, spune că nu știi și sugerează să contacteze suportul.`,
  voicePatterns: {
    enabled: true,
    pausesProbability: 0.3,
    hesitationsProbability: 0.2,
    connectorsEnabled: true,
  },
  customResponses: [
    {
      id: "greeting",
      pattern:
        "^(salut|bună|buna|bună ziua|buna ziua|bună seara|buna seara|bună dimineața|buna dimineata|hello|hi|hey|servus)\\b",
      response: "Bună, eu sunt asistenta ta virtuală Cristina. Cum te pot ajuta astăzi?",
      enabled: true,
    },
    {
      id: "thanks",
      pattern: "\\b(mulțumesc|multumesc|mersi|thanks)\\b",
      response: "Cu plăcere! 😊 Mai ai alte întrebări?",
      enabled: true,
    },
  ],
  templates: {
    greeting: "Bună! 👋 Sunt Cristina, asistenta ta virtuală. Cu ce te pot ajuta?",
    thanks: "Cu plăcere! 😊 Mai ai alte întrebări?",
    noResults: "Îmi pare rău, dar vă rog să fiți mai explicit.",
    tokenBlocked: "Lista este blocată, vă rugăm să deblocați tokenul",
    followUp: "Am găsit {count} rezultate. Ce detalii suplimentare te interesează?",
  },
  welcomeMessage: {
    enabled: true,
    message: "Bună, eu sunt asistenta ta virtuală Cristina. Cum te pot ajuta astăzi?",
    initialDelay: 500,
    typingDelay: 2000,
  },
};

function safeObj<T extends object>(v: any, fallback: T): T {
  return v && typeof v === "object" ? (v as T) : fallback;
}

function mergeResponseConfig(base: AIResponseConfig, incoming: any): AIResponseConfig {
  const inc = safeObj<any>(incoming, {});
  return {
    ...base,
    ...inc,
    welcomeMessage: inc.welcomeMessage || base.welcomeMessage,
    templates: { ...base.templates, ...(inc.templates || {}) },
    voicePatterns: { ...base.voicePatterns, ...(inc.voicePatterns || {}) },
    customResponses: Array.isArray(inc.customResponses) ? inc.customResponses : base.customResponses,
  };
}

const AI_DRIVE_UNLOCK_KEY = "ai-drive-unlocked";

export default function AIDrivePage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const [config, setConfig] = useState<AIConfig>({
    autoIndexEnabled: false,
    autoIndexMode: "delayed",
    scheduledScanEnabled: false,
    scheduledScanTime: "02:00",
    lastScanDate: null,
    lastScanCount: 0,
    suggestionsEnabled: true,
    autoSuggestions: true,
  });

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [scanLogs, setScanLogs] = useState<AIScanLog[]>([]);
  const [modules, setModules] = useState<any[]>([]);

  // AI Response Configuration
  const [responseConfig, setResponseConfig] = useState<AIResponseConfig>(DEFAULT_RESPONSE_CONFIG);

  // Draft for editing (avoid saving on every keystroke)
  const [draftResponseConfig, setDraftResponseConfig] = useState<AIResponseConfig>(DEFAULT_RESPONSE_CONFIG);
  const [isSavingResponseConfig, setIsSavingResponseConfig] = useState(false);

  const [showResponseConfigModal, setShowResponseConfigModal] = useState(false);
  const [editingCustomResponse, setEditingCustomResponse] = useState<any>(null);
  const [testQuery, setTestQuery] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [availableProductsCount, setAvailableProductsCount] = useState(0);
  const [availableCategoriesCount, setAvailableCategoriesCount] = useState(0);

  // Verifică dacă utilizatorul a introdus deja parola în această sesiune
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(AI_DRIVE_UNLOCK_KEY);
    setUnlocked(stored === "1");
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (!passwordInput.trim()) {
      setPasswordError("Introdu parola.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch("/api/admin/ai-drive/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        sessionStorage.setItem(AI_DRIVE_UNLOCK_KEY, "1");
        setUnlocked(true);
        setPasswordInput("");
      } else {
        setPasswordError("Parolă incorectă.");
      }
    } catch {
      setPasswordError("Eroare la verificare. Încearcă din nou.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Keep draft in sync when responseConfig changes (load from server)
  useEffect(() => {
    setDraftResponseConfig(responseConfig);
  }, [responseConfig]);

  // Persist scan logs (single source of truth)
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("aiScanLogs", JSON.stringify(scanLogs));
  }, [scanLogs]);

  // Fetch real counts from API (service role, no RLS) so numbers match DB and update correctly
  const updateAvailableCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/ai-drive/counts");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = typeof data?.error === "string" ? data.error : "Failed to fetch counts";
        throw new Error(msg);
      }
      if (!data.success) {
        const msg = typeof data?.error === "string" ? data.error : "Invalid response";
        throw new Error(msg);
      }
      setAvailableProductsCount(data.products ?? 0);
      setAvailableCategoriesCount(data.categories ?? 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
      console.error("Error in updateAvailableCounts:", message);
      setAvailableProductsCount(0);
      setAvailableCategoriesCount(0);
    }
  }, []);

  // Load and count available products and categories
  useEffect(() => {
    updateAvailableCounts();

    const interval = setInterval(() => {
      updateAvailableCounts();
    }, 30000);

    return () => clearInterval(interval);
  }, [updateAvailableCounts]);

  // Load config from Supabase
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/ai-drive/settings");
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.settings) {
          if (result.settings.config) {
            setConfig(result.settings.config);
          }

          if (result.settings.responseConfig) {
            setResponseConfig((prev) => mergeResponseConfig(prev, result.settings.responseConfig));
          }
        }
      }
    } catch (error) {
      console.error("Error loading AI Drive settings from Supabase:", error);

      // Fallback la localStorage
      if (typeof window !== "undefined") {
        const savedConfig = localStorage.getItem("aiDriveConfig");
        if (savedConfig) {
          try {
            setConfig(JSON.parse(savedConfig));
          } catch (e) {
            console.error("Error loading AI config from localStorage:", e);
          }
        }

        const savedResponseConfig = localStorage.getItem("aiResponseConfig");
        if (savedResponseConfig) {
          try {
            const parsed = JSON.parse(savedResponseConfig);
            setResponseConfig((prev) => mergeResponseConfig(prev, parsed));
          } catch (e) {
            console.error("Error loading response config from localStorage:", e);
          }
        }
      }
    }

    // Load scan logs & modules from localStorage
    if (typeof window !== "undefined") {
      const savedLogs = localStorage.getItem("aiScanLogs");
      if (savedLogs) {
        try {
          setScanLogs(JSON.parse(savedLogs));
        } catch (e) {
          console.error("Error loading scan logs:", e);
        }
      }

      const savedModules = localStorage.getItem("aiModules");
      if (savedModules) {
        try {
          setModules(JSON.parse(savedModules));
        } catch (e) {
          console.error("Error loading AI modules:", e);
        }
      }
    }
  };

  // Save config
  const saveConfig = async (newConfig: AIConfig) => {
    setConfig(newConfig);

    try {
      const response = await fetch("/api/admin/ai-drive/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: newConfig }),
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("aiDriveConfig", JSON.stringify(newConfig));
      }

      if (!response.ok) {
        console.error("Error saving AI Drive config to Supabase");
      }
    } catch (error) {
      console.error("Error saving AI Drive config:", error);
      if (typeof window !== "undefined") {
        localStorage.setItem("aiDriveConfig", JSON.stringify(newConfig));
      }
    }
  };

  // Client-side scheduled scan (note: works only while tab is open)
  const setupScheduledScan = (cfg: AIConfig) => {
    if (!cfg.scheduledScanEnabled || typeof window === "undefined") return () => {};

    let timeoutId: any;
    let intervalId: any;

    const [hours, minutes] = cfg.scheduledScanTime.split(":").map(Number);
    const now = new Date();
    const scanTime = new Date();
    scanTime.setHours(hours, minutes || 0, 0, 0);

    if (scanTime <= now) {
      scanTime.setDate(scanTime.getDate() + 1);
    }

    const msUntilScan = scanTime.getTime() - now.getTime();

    timeoutId = setTimeout(() => {
      handleScanProducts("full");
      intervalId = setInterval(() => handleScanProducts("full"), 24 * 60 * 60 * 1000);
    }, msUntilScan);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  };

  useEffect(() => {
    const cleanup = setupScheduledScan(config);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.scheduledScanEnabled, config.scheduledScanTime]);

  // Reindex products for image search
  const handleReindexImageSearch = async () => {
    if (isScanning) return;

    setIsScanning(true);
    setScanProgress(0);
    setScanStatus("Se reindexează produsele pentru căutare după imagine... (poate dura câteva minute)");

    try {
      const progressInterval = setInterval(() => {
        setScanProgress((prev) => Math.min(prev + 0.5, 90));
      }, 2000);

      const response = await fetch("/api/reindex/products", { method: "POST" });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: "Eroare necunoscută", message: `HTTP ${response.status}: ${response.statusText}` };
        }
        const errorMessage = errorData.message || errorData.error || "Failed to reindex products for image search";
        console.error("Reindex error details:", { status: response.status, statusText: response.statusText, errorData });
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("Reindex result:", result);

      setScanProgress(100);

      if (result.errors > 0) {
        setScanStatus(
          `Reindexare completă cu erori: ${result.indexed || 0} indexate, ${result.errors} erori, ${result.skipped || 0} omise.`
        );
      } else {
        setScanStatus(`Reindexare completă! ${result.indexed || 0} produse indexate pentru căutare după imagine.`);
      }

      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
        setScanStatus("");
      }, 5000);
    } catch (error: any) {
      console.error("Reindex error:", error);
      setScanStatus(`Eroare: ${error.message || "Eroare necunoscută la reindexare"}`);
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Manual scan products
  const handleScanProducts = async (type: "products" | "categories" | "full" = "products") => {
    if (isScanning) return;

    setIsScanning(true);
    setScanProgress(0);
    setScanStatus(`Se scanează ${type === "products" ? "produsele" : type === "categories" ? "categoriile" : "totul"}...`);

    const scanLog: AIScanLog = {
      id: `scan-${Date.now()}`,
      type,
      status: "running",
      startTime: new Date().toISOString(),
      itemsScanned: 0,
    };

    // add log immediately
    setScanLogs((prev) => [scanLog, ...prev.slice(0, 49)]);

    try {
      // Load products from Supabase (exclude deleted – same as public listing)
      const { data: productsData, error } = await supabase
        .from("products")
        .select(
          "id, title, description, category, subcategory, status, approval_status, starting_price_ron, currency, images, slug, url"
        )
        .neq("status", "deleted")
        .or("status.eq.active,approval_status.eq.approved")
        .not("title", "is", null)
        .not("description", "is", null);

      if (error) {
        console.error("Error loading products from Supabase:", error);
        throw new Error("Eroare la încărcarea produselor din Supabase");
      }

      const products = (productsData || []).filter((p: any) => {
        const hasStatus = p.status === "active" || p.approval_status === "approved";
        const hasTitle = !!p.title;
        const hasDescription = !!p.description;
        return hasStatus && hasTitle && hasDescription;
      });

      console.log(`Loaded ${products.length} active products (out of ${productsData?.length || 0} total)`);

      if (type === "products" || type === "full") {
        if (products.length === 0) {
          throw new Error(
            "Nu s-au găsit produse active în sistem. Adaugă produse active cu titlu și descriere pentru a putea le indexa."
          );
        }

        setScanProgress(25);
        setScanStatus(`Se indexează ${products.length} produse...`);

        const response = await fetch("/api/ai/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "products", data: products }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Eroare necunoscută" }));
          throw new Error(errorData.error || "Failed to index products");
        }

        const result = await response.json();
        console.log("Indexing result:", result);
        setScanProgress(75);
      } else {
        setScanProgress(50);
      }

      if (type === "categories" || type === "full") {
        if (products.length === 0) {
          throw new Error(
            "Nu s-au găsit produse active în sistem. Pentru a indexa categorii, trebuie să existe produse cu categorii definite."
          );
        }

        const categories = new Set<string>();
        products.forEach((p: any) => {
          if (p.category) categories.add(p.category);
          if (p.subcategory) categories.add(p.subcategory);
        });

        if (categories.size === 0) {
          if (type === "categories") {
            throw new Error(
              "Nu s-au găsit categorii în produsele active. Adaugă produse cu categorii definite pentru a putea le indexa."
            );
          }
          setScanStatus("Nu s-au găsit categorii de indexat.");
        } else {
          setScanStatus(`Se indexează ${categories.size} categorii...`);

          const categoryPages = Array.from(categories).map((cat) => ({
            id: `cat-${cat.toLowerCase().replace(/\s+/g, "-")}`,
            title: `Categorie: ${cat}`,
            content: `Produse din categoria ${cat}. Caută produse din această categorie pentru rezultate relevante.`,
            url: `/search?category=${encodeURIComponent(cat)}`,
          }));

          const catResponse = await fetch("/api/ai/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "pages", data: categoryPages }),
          });

          if (!catResponse.ok) {
            const errorData = await catResponse.json().catch(() => ({ error: "Eroare necunoscută" }));
            throw new Error(errorData.error || "Failed to index categories");
          }

          const catResult = await catResponse.json();
          console.log("Categories indexing result:", catResult);
        }

        setScanProgress(90);
      }

      setScanProgress(100);

      // final message
      const categories = new Set<string>();
      products.forEach((p: any) => {
        if (p.category) categories.add(p.category);
        if (p.subcategory) categories.add(p.subcategory);
      });

      const indexedProducts = type === "products" || type === "full" ? products.length : 0;
      const indexedCategories = type === "categories" || type === "full" ? categories.size : 0;

      let successMessage = "Scanare completă!";
      if (indexedProducts > 0 && indexedCategories > 0) {
        successMessage = `Scanare completă! ${indexedProducts} produse și ${indexedCategories} categorii indexate cu succes.`;
      } else if (indexedProducts > 0) {
        successMessage = `Scanare completă! ${indexedProducts} produse indexate cu succes.`;
      } else if (indexedCategories > 0) {
        successMessage = `Scanare completă! ${indexedCategories} categorii indexate cu succes.`;
      }
      setScanStatus(successMessage);

      // Update scan log (functional update)
      setScanLogs((prev) =>
        prev.map((l) =>
          l.id === scanLog.id
            ? {
                ...l,
                status: "completed",
                endTime: new Date().toISOString(),
                itemsScanned: indexedProducts + indexedCategories,
              }
            : l
        )
      );

      // Update config
      const updatedConfig: AIConfig = {
        ...config,
        lastScanDate: new Date().toISOString(),
        lastScanCount: products.length,
      };
      saveConfig(updatedConfig);

      // Update counts after successful scan
      updateAvailableCounts();

      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
        setScanStatus("");
      }, 2000);
    } catch (error: any) {
      console.error("Scan error:", error);
      setScanStatus(`Eroare: ${error.message}`);

      setScanLogs((prev) =>
        prev.map((l) =>
          l.id === scanLog.id
            ? {
                ...l,
                status: "error",
                endTime: new Date().toISOString(),
                error: error.message,
              }
            : l
        )
      );

      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Generate suggestions: persist in DB (source of truth) via API; optional localStorage cache
  const handleGenerateSuggestions = async () => {
    setScanStatus("Se generează sugestii...");

    try {
      const response = await fetch("/api/admin/search/popular/generate", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Eroare la generare sugestii");
      }

      const count = data.count ?? 0;

      if (typeof window !== "undefined") {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, title, category, subcategory")
          .or("status.eq.active,approval_status.eq.approved")
          .not("title", "is", null);
        const products = productsData || [];
        const suggestions = {
          products: products.map((p: any) => p.title).filter(Boolean),
          categories: Array.from(new Set([...products.map((p: any) => p.category).filter(Boolean), ...products.map((p: any) => p.subcategory).filter(Boolean)])),
          brands: Array.from(new Set(products.map((p: any) => {
            const title = (p.title || "").toLowerCase();
            for (const kw of ["bmw", "mercedes", "audi", "samsung", "apple", "nike", "adidas", "dacia", "volkswagen", "ford", "opel"]) {
              if (title.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
            }
            return null;
          }).filter(Boolean))),
        };
        localStorage.setItem("aiSuggestions", JSON.stringify(suggestions));
      }

      setScanStatus(`Sugestii generate: ${count} (salvate în baza de date). Căutări frecvente actualizate.`);
      setTimeout(() => setScanStatus(""), 4000);
    } catch (error: any) {
      setScanStatus(`Eroare: ${error.message}`);
      setTimeout(() => setScanStatus(""), 3000);
    }
  };

  // Save response config (explicit action)
  const saveResponseConfigToStore = async (newConfig: AIResponseConfig) => {
    setResponseConfig(newConfig);

    try {
      const response = await fetch("/api/admin/ai-drive/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseConfig: newConfig }),
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("aiResponseConfig", JSON.stringify(newConfig));
      }

      if (!response.ok) {
        console.error("Error saving AI Response config to Supabase");
      }
    } catch (error) {
      console.error("Error saving AI Response config:", error);
      if (typeof window !== "undefined") {
        localStorage.setItem("aiResponseConfig", JSON.stringify(newConfig));
      }
    }
  };

  // Test AI response (send config in body, no localStorage dependency)
  const handleTestResponse = async () => {
    if (!testQuery.trim()) return;

    setIsTesting(true);
    setTestResponse("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testQuery,
          conversationId: "test",
          responseConfig: draftResponseConfig,
        }),
      });

      const data = await response.json();
      setTestResponse(data.answer || "Eroare la generare răspuns");
    } catch (error: any) {
      setTestResponse(`Eroare: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Add custom response (edit draft)
  const handleAddCustomResponse = () => {
    const newResponse = {
      id: `custom-${Date.now()}`,
      pattern: "",
      response: "",
      enabled: true,
    };
    setEditingCustomResponse(newResponse);
  };

  // Save custom response into draft (not persisted until Save button)
  const handleSaveCustomResponse = () => {
    if (!editingCustomResponse) return;

    setDraftResponseConfig((prev) => {
      const exists = prev.customResponses.some((r) => r.id === editingCustomResponse.id);
      const nextCustomResponses = exists
        ? prev.customResponses.map((r) => (r.id === editingCustomResponse.id ? editingCustomResponse : r))
        : [...prev.customResponses, editingCustomResponse];

      return { ...prev, customResponses: nextCustomResponses };
    });

    setEditingCustomResponse(null);
  };

  // Delete custom response from draft
  const handleDeleteCustomResponse = (id: string) => {
    setDraftResponseConfig((prev) => ({
      ...prev,
      customResponses: prev.customResponses.filter((r) => r.id !== id),
    }));
  };

  // Delete single scan log
  const handleDeleteScanLog = (logId: string) => {
    if (!confirm("Sigur vrei să ștergi acest log de scanare?")) return;
    setScanLogs((prev) => prev.filter((log) => log.id !== logId));
  };

  // Delete all scan logs
  const handleDeleteAllScanLogs = () => {
    if (!confirm("Sigur vrei să ștergi toate log-urile de scanare?")) return;
    setScanLogs([]);
  };

  // Modal parolă – informații sensibile
  if (unlocked !== true) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Drive</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Această zonă conține informații sensibile. Introdu parola pentru acces.
          </p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="ai-drive-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Informații sensibile
              </label>
              <input
                id="ai-drive-password"
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                placeholder="Parolă"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoComplete="current-password"
                autoFocus
                disabled={isVerifying}
              />
            </div>
            {passwordError && (
              <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={isVerifying}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {isVerifying ? "Se verifică…" : "Acces"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent mb-2">
            AI Drive
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Control centralizat pentru toate funcțiile AI și indexarea produselor</p>
        </div>

        {/* Status Card */}
        {scanStatus && (
          <div
            className={`mb-6 p-4 rounded-xl ${
              isScanning
                ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {isScanning && <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />}
              <p className={`font-medium ${isScanning ? "text-blue-700 dark:text-blue-300" : "text-green-700 dark:text-green-300"}`}>
                {scanStatus}
              </p>
            </div>
            {isScanning && scanProgress > 0 && (
              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Manual Scan */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Scanare Manuală</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Scanează manual produsele și categoriile pentru indexare în sistemul de căutare</p>

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Produse Disponibile</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{availableProductsCount}</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Categorii Disponibile</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{availableCategoriesCount}</p>
              </div>
            </div>

            {availableProductsCount === 0 && (
              <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  <i className="ri-information-line mr-2" />
                  Nu există produse active disponibile pentru indexare. Adaugă produse active cu titlu și descriere pentru a putea le indexa.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => handleScanProducts("products")}
                disabled={isScanning}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                <i className="ri-scan-line mr-2" />
                Scanează Produse
              </button>

              <button
                onClick={() => handleScanProducts("categories")}
                disabled={isScanning}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                <i className="ri-folder-line mr-2" />
                Scanează Categorii
              </button>

              <button
                onClick={() => handleScanProducts("full")}
                disabled={isScanning}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                <i className="ri-refresh-line mr-2" />
                Scanare Completă
              </button>

              <button
                onClick={handleReindexImageSearch}
                disabled={isScanning}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                title="Reindexează produsele pentru căutare după imagine"
              >
                <i className="ri-image-search-line mr-2" />
                Reindexare Image Search
              </button>

              <button
                onClick={handleGenerateSuggestions}
                disabled={isScanning}
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
              >
                <i className="ri-lightbulb-line mr-2" />
                Generează Sugestii
              </button>
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                <i className="ri-search-line mr-2" />
                Căutări frecvente (popular)
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                &quot;Generează Sugestii&quot; salvează <strong>în baza de date</strong> (tabelul <code>search_popular_suggestions</code>). Căutările frecvente sunt afișate la focus în bara de căutare și sunt aceleași pe toate dispozitivele. După generare, toți utilizatorii văd noile sugestii (categorii, subcategorii, branduri din produse active).
              </p>
            </div>

            {config.lastScanDate && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-sm text-gray-600 dark:text-gray-400">Ultima scanare: {new Date(config.lastScanDate).toLocaleString("ro-RO")}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Produse indexate: {config.lastScanCount}</p>
              </div>
            )}
          </div>

          {/* Auto Index Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Indexare Automată</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Configurează indexarea automată când se adaugă produse noi</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Indexare Automată</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Indexează automat produsele noi</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Notă: pentru Supabase, auto-index real se face server-side (trigger/cron). În UI păstrăm doar setarea.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoIndexEnabled}
                    onChange={(e) => saveConfig({ ...config, autoIndexEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                </label>
              </div>

              {config.autoIndexEnabled && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Mod Indexare</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="autoIndexMode"
                        value="live"
                        checked={config.autoIndexMode === "live"}
                        onChange={(e) => saveConfig({ ...config, autoIndexMode: e.target.value as "live" | "delayed" })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Live (imediat)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="autoIndexMode"
                        value="delayed"
                        checked={config.autoIndexMode === "delayed"}
                        onChange={(e) => saveConfig({ ...config, autoIndexMode: e.target.value as "live" | "delayed" })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Întârziat (20 minute)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scheduled Scan */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Scanare Programată</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Programează scanarea automată zilnică</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Scanare Zilnică</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Activează scanarea automată zilnică</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Notă: în client funcționează doar dacă tab-ul rămâne deschis. Recomandat: cron server-side.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.scheduledScanEnabled}
                    onChange={(e) => saveConfig({ ...config, scheduledScanEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                </label>
              </div>

              {config.scheduledScanEnabled && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ora Scanării</p>
                  <select
                    value={config.scheduledScanTime}
                    onChange={(e) => saveConfig({ ...config, scheduledScanTime: e.target.value })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100"
                  >
                    <option value="00:30">00:30</option>
                    <option value="02:00">02:00</option>
                    <option value="03:00">03:00</option>
                    <option value="04:00">04:00</option>
                    <option value="05:00">05:00</option>
                    <option value="06:00">06:00</option>
                    <option value="07:00">07:00</option>
                    <option value="15:00">15:00</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* AI Modules Control */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Module AI</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Gestionează modulele AI instalate</p>

            <div className="space-y-3">
              {modules.length === 0 && <p className="text-gray-500 text-center py-4">Nu sunt module AI configurate</p>}

              {modules.map((module: any) => (
                <div key={module.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{module.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{module.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={module.enabled}
                        onChange={(e) => {
                          const updated = modules.map((m) => (m.id === module.id ? { ...m, enabled: e.target.checked } : m));
                          setModules(updated);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("aiModules", JSON.stringify(updated));
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Response Configuration */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configurare Răspunsuri AI</h2>
            <div className="flex gap-2">
              {showResponseConfigModal && (
                <button
                  onClick={async () => {
                    setIsSavingResponseConfig(true);
                    try {
                      await saveResponseConfigToStore(draftResponseConfig);
                    } finally {
                      setIsSavingResponseConfig(false);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all"
                >
                  {isSavingResponseConfig ? "Se salvează..." : "Salvează"}
                </button>
              )}
              <button
                onClick={() => setShowResponseConfigModal(!showResponseConfigModal)}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold transition-all"
              >
                {showResponseConfigModal ? "Ascunde" : "Configurează"}
              </button>
            </div>
          </div>

          {showResponseConfigModal && (
            <div className="space-y-6">
              {/* Style Selection */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Stil Răspuns</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(["formal", "casual", "friendly", "professional"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setDraftResponseConfig({ ...draftResponseConfig, style })}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        draftResponseConfig.style === style
                          ? "bg-blue-500 text-white"
                          : "bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500"
                      }`}
                    >
                      {style === "formal" && "Formal"}
                      {style === "casual" && "Casual"}
                      {style === "friendly" && "Prietenoasă"}
                      {style === "professional" && "Profesională"}
                    </button>
                  ))}
                </div>
              </div>

              {/* System Prompt */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">System Prompt</p>
                <textarea
                  value={draftResponseConfig.systemPrompt}
                  onChange={(e) => setDraftResponseConfig({ ...draftResponseConfig, systemPrompt: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="System prompt pentru AI..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Prompt-ul de bază care definește personalitatea AI-ului</p>
              </div>

              {/* Voice Patterns */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Pattern-uri Vocale</p>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftResponseConfig.voicePatterns.enabled}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          voicePatterns: { ...draftResponseConfig.voicePatterns, enabled: e.target.checked },
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                  </label>
                </div>

                {draftResponseConfig.voicePatterns.enabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                        Probabilitate pauze: {Math.round(draftResponseConfig.voicePatterns.pausesProbability * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={draftResponseConfig.voicePatterns.pausesProbability}
                        onChange={(e) =>
                          setDraftResponseConfig({
                            ...draftResponseConfig,
                            voicePatterns: { ...draftResponseConfig.voicePatterns, pausesProbability: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                        Probabilitate ezitări: {Math.round(draftResponseConfig.voicePatterns.hesitationsProbability * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={draftResponseConfig.voicePatterns.hesitationsProbability}
                        onChange={(e) =>
                          setDraftResponseConfig({
                            ...draftResponseConfig,
                            voicePatterns: {
                              ...draftResponseConfig.voicePatterns,
                              hesitationsProbability: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftResponseConfig.voicePatterns.connectorsEnabled}
                        onChange={(e) =>
                          setDraftResponseConfig({
                            ...draftResponseConfig,
                            voicePatterns: { ...draftResponseConfig.voicePatterns, connectorsEnabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Folosește conectoare ("așa", "deci")</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Templates */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Template-uri Mesaje</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Greeting</label>
                    <input
                      type="text"
                      value={draftResponseConfig.templates.greeting}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          templates: { ...draftResponseConfig.templates, greeting: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Mulțumiri</label>
                    <input
                      type="text"
                      value={draftResponseConfig.templates.thanks}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          templates: { ...draftResponseConfig.templates, thanks: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Fără rezultate</label>
                    <input
                      type="text"
                      value={draftResponseConfig.templates.noResults}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          templates: { ...draftResponseConfig.templates, noResults: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Token blocat</label>
                    <input
                      type="text"
                      value={draftResponseConfig.templates.tokenBlocked}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          templates: { ...draftResponseConfig.templates, tokenBlocked: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Welcome Message Configuration */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Mesaj de Bun Venit</p>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftResponseConfig.welcomeMessage?.enabled ?? true}
                      onChange={(e) =>
                        setDraftResponseConfig({
                          ...draftResponseConfig,
                          welcomeMessage: {
                            ...(draftResponseConfig.welcomeMessage || {
                              enabled: true,
                              message: "",
                              initialDelay: 500,
                              typingDelay: 2000,
                            }),
                            enabled: e.target.checked,
                          },
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                  </label>
                </div>

                {(draftResponseConfig.welcomeMessage?.enabled ?? true) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mesaj de Bun Venit</label>
                      <textarea
                        value={draftResponseConfig.welcomeMessage?.message || ""}
                        onChange={(e) =>
                          setDraftResponseConfig({
                            ...draftResponseConfig,
                            welcomeMessage: {
                              ...(draftResponseConfig.welcomeMessage || {
                                enabled: true,
                                message: "",
                                initialDelay: 500,
                                typingDelay: 2000,
                              }),
                              message: e.target.value,
                            },
                          })
                        }
                        rows={3}
                        placeholder="Mesajul de bun venit care apare automat..."
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Acest mesaj apare automat când utilizatorul deschide un chat nou
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Delay Inițial (ms)</label>
                        <input
                          type="number"
                          min="0"
                          max="5000"
                          step="100"
                          value={draftResponseConfig.welcomeMessage?.initialDelay ?? 500}
                          onChange={(e) =>
                            setDraftResponseConfig({
                              ...draftResponseConfig,
                              welcomeMessage: {
                                ...(draftResponseConfig.welcomeMessage || {
                                  enabled: true,
                                  message: "",
                                  initialDelay: 500,
                                  typingDelay: 2000,
                                }),
                                initialDelay: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Recomandat: ~500ms</p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Delay Scriere (ms)</label>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="100"
                          value={draftResponseConfig.welcomeMessage?.typingDelay ?? 2000}
                          onChange={(e) =>
                            setDraftResponseConfig({
                              ...draftResponseConfig,
                              welcomeMessage: {
                                ...(draftResponseConfig.welcomeMessage || {
                                  enabled: true,
                                  message: "",
                                  initialDelay: 500,
                                  typingDelay: 2000,
                                }),
                                typingDelay: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Recomandat: ~2000ms</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Responses */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Răspunsuri Personalizate</p>
                  <button onClick={handleAddCustomResponse} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-all">
                    + Adaugă
                  </button>
                </div>

                <div className="space-y-3">
                  {draftResponseConfig.customResponses.map((custom) => (
                    <div key={custom.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={custom.enabled}
                                onChange={(e) => {
                                  setDraftResponseConfig((prev) => ({
                                    ...prev,
                                    customResponses: prev.customResponses.map((r) => (r.id === custom.id ? { ...r, enabled: e.target.checked } : r)),
                                  }));
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                            </label>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{custom.enabled ? "Activ" : "Dezactivat"}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Pattern:{" "}
                            <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{custom.pattern}</code>
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{custom.response}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingCustomResponse(custom)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                            title="Editează"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCustomResponse(custom.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title="Șterge"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Response */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Test Răspuns AI</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    placeholder="Scrie o întrebare pentru test..."
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={handleTestResponse}
                    disabled={isTesting || !testQuery.trim()}
                    className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
                  >
                    {isTesting ? "Testează..." : "Testează Răspuns"}
                  </button>
                  {testResponse && (
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Răspuns AI:</p>
                      <p className="text-gray-900 dark:text-gray-100">{testResponse}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scan Logs */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Jurnal Scanări</h2>
            {scanLogs.length > 0 && (
              <button
                onClick={handleDeleteAllScanLogs}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-all text-sm flex items-center gap-2"
              >
                <i className="ri-delete-bin-line" />
                Șterge Tot
              </button>
            )}
          </div>

          {scanLogs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nu există scanări încă</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Tip</th>
                    <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Data</th>
                    <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Items</th>
                    <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {scanLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400 capitalize">{log.type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            log.status === "completed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : log.status === "error"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          }`}
                        >
                          {log.status === "completed" ? "Completat" : log.status === "error" ? "Eroare" : "În curs"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{new Date(log.startTime).toLocaleString("ro-RO")}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{log.itemsScanned}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDeleteScanLog(log.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Șterge log"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Custom Response Modal */}
        {editingCustomResponse && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {editingCustomResponse.id && draftResponseConfig.customResponses.find((r) => r.id === editingCustomResponse.id)
                    ? "Editează Răspuns"
                    : "Adaugă Răspuns Nou"}
                </h3>
                <button
                  onClick={() => setEditingCustomResponse(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Pattern (Regex sau keyword)</label>
                  <input
                    type="text"
                    value={editingCustomResponse.pattern}
                    onChange={(e) => setEditingCustomResponse({ ...editingCustomResponse, pattern: e.target.value })}
                    placeholder="ex: ^(salut|bună) sau keyword: salut"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Regex pattern sau keyword simplu</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Răspuns</label>
                  <textarea
                    value={editingCustomResponse.response}
                    onChange={(e) => setEditingCustomResponse({ ...editingCustomResponse, response: e.target.value })}
                    rows={5}
                    placeholder="Răspunsul AI pentru acest pattern..."
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingCustomResponse.enabled}
                      onChange={(e) => setEditingCustomResponse({ ...editingCustomResponse, enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                  </label>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Activ</span>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleSaveCustomResponse} className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-all">
                    Salvează
                  </button>
                  <button onClick={() => setEditingCustomResponse(null)} className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all">
                    Anulează
                  </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Modificările intră în draft. Apasă „Salvează” sus la Configurare Răspunsuri AI ca să le trimiți în Supabase.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
