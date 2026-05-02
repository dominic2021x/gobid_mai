"use client";

import { useState, type ReactNode } from "react";

interface ActionButtonProps {
  label: string;
  method?: "POST" | "GET";
  href: string;
  body?: Record<string, unknown>;
  onSuccess?: (res: Response, data: unknown) => void;
  onError?: (msg: string) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function ActionButton({
  label,
  method = "POST",
  href,
  body,
  onSuccess,
  onError,
  children,
  className = "",
  disabled = false,
}: ActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const run = async () => {
    if (loading || disabled) return;
    setLoading(true);
    setMessage(null);
    try {
      const token = await getAdminToken();
      if (!token) {
        setMessage({ type: "error", text: "Nu ești autentificat." });
        onError?.("Unauthorized");
        return;
      }
      const res = await fetch(href, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        ...(body !== undefined && method !== "GET" && { body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error ?? `Eroare ${res.status}`;
        setMessage({ type: "error", text: msg });
        onError?.(msg);
        return;
      }
      setMessage({ type: "success", text: "Succes." });
      onSuccess?.(res, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Eroare la cerere.";
      setMessage({ type: "error", text: msg });
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={loading || disabled}
        className={`
          inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
          bg-[#4285F4] text-white hover:bg-[#3367D6]
          focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:ring-offset-2
          disabled:opacity-60 disabled:cursor-not-allowed
          ${className}
        `}
      >
        {children}
        <span>{label}</span>
        {loading && (
          <i className="ri-loader-4-line animate-spin text-base" aria-hidden />
        )}
      </button>
      {message && (
        <p
          className={`text-sm ${message.type === "success" ? "text-[#34A853]" : "text-[#EA4335]"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}
