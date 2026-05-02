"use client";

import { useState, useEffect, useCallback } from "react";
import GrowthCard from "../_components/GrowthCard";
import GrowthButton from "../_components/GrowthButton";
import GrowthPageShell from "../_components/GrowthPageShell";

const PRODUCT_LABELS: Record<string, string> = {
  search_console: "Search Console",
  google_ads: "Google Ads",
  ga4: "GA4",
  tag_manager: "Tag Manager",
};

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

interface ProductStatus {
  connected: boolean;
  scopes: string[];
  updated_at: string | null;
}

interface StatusData {
  provider: string;
  products: Record<string, ProductStatus>;
  selections: {
    gsc_site_url: string;
    google_ads_customer_id: string;
    ga4_property_id: string;
    gtm_container_id: string;
  };
}

const inputClass =
  "rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] focus:border-[#4285F4] focus:outline-none focus:ring-1 focus:ring-[#4285F4]";
const labelClass = "block text-sm font-medium text-[#5F6368]";

export default function GrowthIntegrationsPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productsToConnect, setProductsToConnect] = useState<Set<string>>(new Set(["search_console"]));
  const [loadingDiscovery, setLoadingDiscovery] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ siteUrl: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ customerId: string; resourceName: string }>>([]);
  const [properties, setProperties] = useState<Array<{ propertyId: string; displayName?: string }>>([]);
  const [savingSelection, setSavingSelection] = useState<string | null>(null);
  const [gtmInput, setGtmInput] = useState("");

  const fetchStatus = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/growth/integrations/status", {
      });
      if (!res.ok) throw new Error("Eroare la status");
      const data = await res.json();
      setStatus(data);
      setGtmInput(data?.selections?.gtm_container_id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const startOAuth = async () => {
    const token = await getAdminToken();
    if (!token) {
      setError("Trebuie să fii autentificat. Reîncarcă pagina și încearcă din nou.");
      return;
    }
    const list = Array.from(productsToConnect);
    const q = list.length ? `?products=${list.join(",")}` : "";
    setError(null);
    try {
      const res = await fetch(`/api/admin/growth/google/oauth/start${q}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Eroare la pornirea OAuth. Verifică că ai drepturi admin.");
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setError("Răspuns invalid de la server.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la conectare.");
    }
  };

  const toggleProduct = (product: string) => {
    setProductsToConnect((prev) => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product);
      else next.add(product);
      if (next.size === 0) next.add("search_console");
      return next;
    });
  };

  const loadDiscovery = async (type: "sites" | "customers" | "properties") => {
    const token = await getAdminToken();
    if (!token) return;
    setLoadingDiscovery(type);
    try {
      const urls: Record<string, string> = {
        sites: "/api/admin/growth/google/search-console/sites",
        customers: "/api/admin/growth/google/ads/customers",
        properties: "/api/admin/growth/google/ga4/properties",
      };
      const res = await fetch(urls[type], { headers: {} });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? res.statusText);
      }
      const data = await res.json();
      if (type === "sites") setSites(data.sites ?? []);
      if (type === "customers") setCustomers(data.customers ?? []);
      if (type === "properties") setProperties(data.properties ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setLoadingDiscovery(null);
    }
  };

  const saveSelection = async (product: string, value: string) => {
    const token = await getAdminToken();
    if (!token) return;
    setSavingSelection(product);
    try {
      const res = await fetch("/api/admin/growth/google/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ product, selection: value }),
      });
      if (!res.ok) throw new Error("Eroare la salvare");
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSavingSelection(null);
    }
  };

  const connectedCount = status ? Object.values(status.products).filter((p) => p.connected).length : 0;

  return (
    <GrowthPageShell
      title="Integrations"
      description="Conectează produse Google și configurează resursele selectate."
    >
      <div className="space-y-6">
        <GrowthCard
          title="Google Hub"
          description="Conectează unul sau mai multe produse Google (Search Console, Ads, GA4, Tag Manager). După conectare, alege resursele (site, customer, property)."
          accent="blue"
        >
          {loading && !status && <p className="text-sm text-[#5F6368]">Se încarcă...</p>}
          {error && <p className="text-sm text-[#EA4335]">{error}</p>}
          {!loading && status && (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-[#5F6368]">Produse de conectat (bifează și apasă Conectează)</p>
                <div className="flex flex-wrap gap-4">
                  {["search_console", "google_ads", "ga4", "tag_manager"].map((p) => (
                    <label key={p} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={productsToConnect.has(p)}
                        onChange={() => toggleProduct(p)}
                        className="h-4 w-4 rounded border-[#DADCE0] text-[#4285F4] focus:ring-[#4285F4]"
                      />
                      <span className="text-sm text-[#202124]">{PRODUCT_LABELS[p] ?? p}</span>
                      {status.products[p]?.connected && (
                        <span className="text-xs text-[#34A853]">(conectat)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <GrowthButton onClick={startOAuth} icon="ri-google-fill">
                {connectedCount > 0 ? "Reconectează / Adaugă produse" : "Conectează"}
              </GrowthButton>

              {connectedCount > 0 && (
                <div className="border-t border-[#E8EAED] pt-6">
                  <p className="mb-3 text-sm font-medium text-[#5F6368]">Stare per produs</p>
                  <ul className="space-y-2 text-sm text-[#5F6368]">
                    {Object.entries(status.products).map(([p, s]) => (
                      <li key={p} className="flex items-center gap-2">
                        {s.connected ? (
                          <i className="ri-checkbox-circle-fill text-[#34A853]" />
                        ) : (
                          <i className="ri-checkbox-blank-circle-line text-[#9AA0A6]" />
                        )}
                        {PRODUCT_LABELS[p] ?? p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </GrowthCard>

        {!loading && status && connectedCount > 0 && (
          <GrowthCard
            title="Resurse selectate"
            description="Încarcă listele și alege site / customer / property. Opțional: GTM container ID."
            accent="green"
          >
            <div className="space-y-5">
              {status.products.search_console?.connected && (
                <div>
                  <label className={labelClass}>Search Console – siteUrl</label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={status.selections.gsc_site_url}
                      onChange={(e) => saveSelection("search_console", e.target.value)}
                      onFocus={() => sites.length === 0 && loadDiscovery("sites")}
                      className={inputClass}
                    >
                      <option value="">— Alege —</option>
                      {status.selections.gsc_site_url && !sites.some((s) => s.siteUrl === status.selections.gsc_site_url) && (
                        <option value={status.selections.gsc_site_url}>{status.selections.gsc_site_url}</option>
                      )}
                      {sites.map((s) => (
                        <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>
                      ))}
                    </select>
                    <GrowthButton
                      variant="secondary"
                      onClick={() => loadDiscovery("sites")}
                      loading={loadingDiscovery === "sites"}
                    >
                      {loadingDiscovery === "sites" ? "Se încarcă..." : "Încarcă site-uri"}
                    </GrowthButton>
                  </div>
                  {status.selections.gsc_site_url && (
                    <p className="mt-1 text-xs text-[#5F6368]">Selectat: {status.selections.gsc_site_url}</p>
                  )}
                </div>
              )}

              {status.products.google_ads?.connected && (
                <div>
                  <label className={labelClass}>Google Ads – customer_id (MCC ok)</label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={status.selections.google_ads_customer_id}
                      onChange={(e) => saveSelection("google_ads", e.target.value)}
                      onFocus={() => customers.length === 0 && loadDiscovery("customers")}
                      className={inputClass}
                    >
                      <option value="">— Alege —</option>
                      {status.selections.google_ads_customer_id && !customers.some((c) => c.customerId === status.selections.google_ads_customer_id) && (
                        <option value={status.selections.google_ads_customer_id}>{status.selections.google_ads_customer_id}</option>
                      )}
                      {customers.map((c) => (
                        <option key={c.customerId} value={c.customerId}>{c.customerId}</option>
                      ))}
                    </select>
                    <GrowthButton
                      variant="secondary"
                      onClick={() => loadDiscovery("customers")}
                      loading={loadingDiscovery === "customers"}
                    >
                      {loadingDiscovery === "customers" ? "Se încarcă..." : "Încarcă customers"}
                    </GrowthButton>
                  </div>
                  {status.selections.google_ads_customer_id && (
                    <p className="mt-1 text-xs text-[#5F6368]">Selectat: {status.selections.google_ads_customer_id}</p>
                  )}
                </div>
              )}

              {status.products.ga4?.connected && (
                <div>
                  <label className={labelClass}>GA4 – property_id</label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={status.selections.ga4_property_id}
                      onChange={(e) => saveSelection("ga4", e.target.value)}
                      onFocus={() => properties.length === 0 && loadDiscovery("properties")}
                      className={inputClass}
                    >
                      <option value="">— Alege —</option>
                      {status.selections.ga4_property_id && !properties.some((p) => p.propertyId === status.selections.ga4_property_id) && (
                        <option value={status.selections.ga4_property_id}>{status.selections.ga4_property_id}</option>
                      )}
                      {properties.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.propertyId} {p.displayName ? `– ${p.displayName}` : ""}
                        </option>
                      ))}
                    </select>
                    <GrowthButton
                      variant="secondary"
                      onClick={() => loadDiscovery("properties")}
                      loading={loadingDiscovery === "properties"}
                    >
                      {loadingDiscovery === "properties" ? "Se încarcă..." : "Încarcă properties"}
                    </GrowthButton>
                  </div>
                  {status.selections.ga4_property_id && (
                    <p className="mt-1 text-xs text-[#5F6368]">Selectat: {status.selections.ga4_property_id}</p>
                  )}
                </div>
              )}

              {status.products.tag_manager?.connected && (
                <div>
                  <label className={labelClass}>Tag Manager – container_id (opțional)</label>
                  <input
                    type="text"
                    value={gtmInput}
                    onChange={(e) => setGtmInput(e.target.value)}
                    onBlur={() => saveSelection("tag_manager", gtmInput.trim())}
                    placeholder="GTM-XXXXXX"
                    className={`mt-1 max-w-xs ${inputClass}`}
                  />
                  {savingSelection === "tag_manager" && <span className="ml-2 text-xs text-[#5F6368]">Se salvează...</span>}
                </div>
              )}
            </div>
          </GrowthCard>
        )}
      </div>
    </GrowthPageShell>
  );
}
