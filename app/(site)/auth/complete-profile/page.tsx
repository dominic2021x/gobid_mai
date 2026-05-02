"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSessionChecked(true);
      setHasSession(!!data.session);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn && !ln) {
      setError("Introdu prenumele sau numele.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: fn || undefined, lastName: ln || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Eroare la salvare.");
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("Eroare la salvare.");
      setLoading(false);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <p className="text-gray-300">Se încarcă...</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 p-4">
        <div className="text-center text-gray-300 max-w-md">
          <p className="mb-4">Sesiunea nu este disponibilă. Te poți autentifica din nou sau completa profilul din Setări după ce te conectezi.</p>
          <Link href="/auth" className="text-blue-400 hover:underline">Înapoi la autentificare</Link>
          <span className="mx-2">|</span>
          <Link href="/dashboard" className="text-blue-400 hover:underline">Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-800/80 shadow-xl border border-gray-700 p-6">
        <h1 className="text-xl font-semibold text-white mb-2">Completează profilul</h1>
        <p className="text-gray-400 text-sm mb-6">
          Adaugă prenumele și numele pentru a-ți personaliza contul.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-1">
              Prenume
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700/50 text-white px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Prenume"
              autoComplete="given-name"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-1">
              Nume
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700/50 text-white px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nume"
              autoComplete="family-name"
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition"
          >
            {loading ? "Se salvează..." : "Salvează și continuă"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">
            Treci peste, completează mai târziu
          </Link>
        </p>
      </div>
    </div>
  );
}
