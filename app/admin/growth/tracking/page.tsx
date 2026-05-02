"use client";

import { useState, useEffect, useCallback } from "react";
import GrowthCard from "../_components/GrowthCard";
import GrowthButton from "../_components/GrowthButton";
import GrowthPageShell from "../_components/GrowthPageShell";

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const inputClass =
  "mt-1 w-full max-w-xs rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] focus:border-[#4285F4] focus:outline-none focus:ring-1 focus:ring-[#4285F4]";

export default function GrowthTrackingPage() {
  const [gtmId, setGtmId] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/settings", {
      });
      if (!res.ok) return;
      const data = await res.json();
      const settings = data?.settings ?? {};
      setGtmId((settings.GTM_ID?.value as string) ?? "");
      setGa4Id((settings.GA4_ID?.value as string) ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async () => {
    const token = await getAdminToken();
    if (!token) {
      setMessage({ type: "error", text: "Nu ești autentificat." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        fetch("/api/admin/growth/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "GTM_ID", value: gtmId }),
        }),
        fetch("/api/admin/growth/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "GA4_ID", value: ga4Id }),
        }),
      ]);
      setMessage({ type: "success", text: "Setări salvate." });
    } catch {
      setMessage({ type: "error", text: "Eroare la salvare." });
    } finally {
      setSaving(false);
    }
  };

  const snippet = `<!-- Growth Center: GTM / GA4 -->
${gtmId ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');</script>` : ""}
${ga4Id ? `<!-- GA4: ${ga4Id} -->` : ""}`;

  return (
    <GrowthPageShell title="Tracking" description="GTM și GA4 – stochează ID-uri în growth_settings.">
      <div className="space-y-6">
        <GrowthCard
          title="Tracking (GTM / GA4)"
          description="Stochează GTM_ID și GA4_ID în growth_settings."
          accent="green"
        >
          {loading ? (
            <p className="text-sm text-[#5F6368]">Se încarcă...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#5F6368]">GTM ID</label>
                <input
                  type="text"
                  value={gtmId}
                  onChange={(e) => setGtmId(e.target.value)}
                  placeholder="GTM-XXXXXX"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6368]">GA4 ID</label>
                <input
                  type="text"
                  value={ga4Id}
                  onChange={(e) => setGa4Id(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  className={inputClass}
                />
              </div>
              <GrowthButton onClick={save} loading={saving} icon="ri-save-line">
                Salvează
              </GrowthButton>
              {message && (
                <p className={`text-sm ${message.type === "success" ? "text-[#34A853]" : "text-[#EA4335]"}`}>
                  {message.text}
                </p>
              )}
            </div>
          )}
        </GrowthCard>

        <GrowthCard title="Snippet" description="Fragment pentru head (GTM/GA4)." accent="slate">
          <pre className="overflow-x-auto rounded-lg border border-[#E8EAED] bg-[#F8F9FA] p-4 text-xs text-[#5F6368]">
            {snippet || "— Completează GTM_ID / GA4_ID și salvează."}
          </pre>
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
