"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "@/lib/supabase";

type TutorialSettings = {
  mobileNavTutorial: boolean;
};

const DEFAULT_SETTINGS: TutorialSettings = {
  mobileNavTutorial: true,
};

export default function TutorialeAdminPage() {
  const [settings, setSettings] = useState<TutorialSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasFreshSettingsRef = useRef(false);
  const staleRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/tutorial-settings");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (typeof data.mobileNavTutorial === "boolean") {
        const isStale = data?.stale === true;
        if (!isStale) {
          hasFreshSettingsRef.current = true;
          setSettings({
            mobileNavTutorial: data.mobileNavTutorial,
          });
        } else {
          if (!hasFreshSettingsRef.current) {
            setSettings({
              mobileNavTutorial: data.mobileNavTutorial,
            });
          }
          if (!staleRetryTimerRef.current) {
            staleRetryTimerRef.current = setTimeout(() => {
              staleRetryTimerRef.current = null;
              void loadSettings();
            }, 2500);
          }
        }
      }
    } catch (err) {
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    return () => {
      if (staleRetryTimerRef.current) {
        clearTimeout(staleRetryTimerRef.current);
      }
    };
  }, [loadSettings]);

  const updateMobileNavTutorial = async (enabled: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setMessage({ type: "error", text: "Sesiune invalidă. Reautentifică-te în admin." });
        setSaving(false);
        return;
      }
      const res = await fetch("/api/tutorial-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mobileNavTutorial: enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Eroare la salvare");
      }
      setSettings((prev) => ({ ...prev, mobileNavTutorial: enabled }));
      setMessage({ type: "success", text: "Setări salvate." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Eroare la salvare." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-50">
        <div className="animate-pulse rounded-lg bg-gray-200 h-8 w-48 mb-6" />
        <div className="animate-pulse rounded-lg bg-gray-200 h-12 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Tutoriale & Feedback
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Pornește sau oprește tutorialele din aplicație pentru utilizatori.
      </p>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-gray-900">
              Tutorial meniuri mobil
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Când este activat, utilizatorii pe mobil văd tutorialul scurt pentru cele 2 modele de meniuri rapide (lateral și jos). Când este dezactivat, tutorialul nu se afișează deloc.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.mobileNavTutorial}
              disabled={saving}
              onChange={(e) => updateMobileNavTutorial(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            <span className="ms-3 text-sm font-medium text-gray-700">
              {settings.mobileNavTutorial ? "Pornit" : "Oprit"}
            </span>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Poți adăuga aici și alte tutoriale sau opțiuni de feedback pe măsură ce le implementezi.
        </p>
      </div>
    </div>
  );
}
