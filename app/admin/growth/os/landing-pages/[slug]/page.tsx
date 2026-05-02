"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "../../../_components/Card";

interface LpRow {
  slug: string;
  status: string;
  title: string | null;
  meta: string | null;
  h1: string | null;
  intro_md: string | null;
  faq_json: unknown;
  filters_json: unknown;
  canonical_url: string | null;
  noindex: boolean;
}

async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = (await import("@/lib/supabase")).default;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function LandingPageEditPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [row, setRow] = useState<LpRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [h1, setH1] = useState("");
  const [introMd, setIntroMd] = useState("");
  const [faqJson, setFaqJson] = useState("[]");
  const [filtersJson, setFiltersJson] = useState("{}");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [noindex, setNoindex] = useState(false);

  const fetchRow = useCallback(async () => {
    if (!slug) return;
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth/os/landing-pages/${encodeURIComponent(slug)}`, {
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setRow(json as LpRow);
        setTitle(json.title ?? "");
        setMeta(json.meta ?? "");
        setH1(json.h1 ?? "");
        setIntroMd(json.intro_md ?? "");
        setFaqJson(
          typeof json.faq_json === "string"
            ? json.faq_json
            : JSON.stringify(json.faq_json ?? [], null, 2)
        );
        setFiltersJson(
          typeof json.filters_json === "string"
            ? json.filters_json
            : JSON.stringify(json.filters_json ?? {}, null, 2)
        );
        setCanonicalUrl(json.canonical_url ?? "");
        setNoindex(Boolean(json.noindex));
      } else {
        setRow(null);
      }
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchRow();
  }, [fetchRow]);

  const patch = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!slug) return;
      const token = await getAdminToken();
      if (!token) return;
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/growth/os/landing-pages/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({
            type: "error",
            text: (json?.error as string) ?? json?.reasons?.join(", ") ?? `Error ${res.status}`,
          });
          return;
        }
        setMessage({ type: "success", text: "Saved." });
        setRow((prev) => (prev ? { ...prev, ...updates } : null));
        fetchRow();
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Request failed" });
      } finally {
        setSaving(false);
      }
    },
    [slug, fetchRow]
  );

  const handleSave = () => {
    let faq: unknown = [];
    let filters: unknown = {};
    try {
      faq = JSON.parse(faqJson);
    } catch {
      setMessage({ type: "error", text: "Invalid faq_json" });
      return;
    }
    try {
      filters = JSON.parse(filtersJson);
    } catch {
      setMessage({ type: "error", text: "Invalid filters_json" });
      return;
    }
    patch({
      title: title || null,
      meta: meta || null,
      h1: h1 || null,
      intro_md: introMd || null,
      faq_json: faq,
      filters_json: filters,
      canonical_url: canonicalUrl.trim() || null,
      noindex,
    });
  };

  const setStatus = (status: string) => () => {
    const payload: Record<string, unknown> = { status };
    if (status === "published") payload.noindex = noindex;
    patch(payload);
  };

  if (!slug) return null;
  if (loading) return <div className="p-4 text-slate-500">Loading…</div>;
  if (!row) return <div className="p-4 text-slate-600">Not found.</div>;

  const previewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/ro/lp/${encodeURIComponent(slug)}?preview=1`;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/growth/os/landing-pages"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Landing pages
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">{slug}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{row.status}</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-100"
          >
            Preview
          </a>
          <button
            type="button"
            onClick={setStatus("review")}
            disabled={saving || row.status === "review"}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Move to review
          </button>
          <button
            type="button"
            onClick={setStatus("published")}
            disabled={saving || row.status === "published"}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={setStatus("archived")}
            disabled={saving || row.status === "archived"}
            className="rounded bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>
      {message && (
        <div
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")
          }
        >
          {message.text}
        </div>
      )}
      <Card title="Fields" description="Title, meta, h1, intro, FAQ, filters" accent="blue">
        <div className="space-y-3 text-sm">
          <div>
            <label className="block font-medium text-slate-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">Meta</label>
            <input
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">H1</label>
            <input
              value={h1}
              onChange={(e) => setH1(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">Intro (markdown)</label>
            <textarea
              value={introMd}
              onChange={(e) => setIntroMd(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">FAQ (JSON)</label>
            <textarea
              value={faqJson}
              onChange={(e) => setFaqJson(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">Filters (JSON)</label>
            <textarea
              value={filtersJson}
              onChange={(e) => setFiltersJson(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700">Canonical URL</label>
            <input
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="noindex"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
            />
            <label htmlFor="noindex" className="text-slate-700">
              Noindex
            </label>
          </div>
          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
