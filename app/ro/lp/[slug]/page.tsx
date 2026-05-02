import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoListings } from "@/lib/server/products/listingsRepo";
import type { ProductQuery } from "@/lib/server/products/listingsRepo";
import { isAdminFromRequest } from "@/lib/auth/isAdminServer";
import { getAppliedInternalLinksForSource } from "@/lib/growth/internalLinks";

const DEFAULT_LIMIT = 30;

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function getLpRow(slug: string, publishedOnly: boolean) {
  const supabase = createAdminClient();
  let query = supabase
    .from("seo_landing_pages")
    .select("slug, title, meta, h1, intro_md, faq_json, filters_json, canonical_url, noindex")
    .eq("slug", slug);
  if (publishedOnly) query = query.eq("status", "published");
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await getLpRow(slug, true);
  if (!row) return { title: "Not found" };
  const robots = row.noindex ? "noindex, follow" : undefined;
  const canonical = row.canonical_url ?? undefined;
  return {
    title: row.title ?? row.h1 ?? slug,
    description: row.meta ?? undefined,
    robots,
    alternates: canonical ? { canonical } : undefined,
  };
}

export default async function LpPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const preview = sp?.preview === "1";
  const row = preview
    ? (await isAdminFromRequest())
      ? await getLpRow(slug, false)
      : null
    : await getLpRow(slug, true);
  if (!row) notFound();

  const filters = (row.filters_json ?? {}) as Record<string, unknown>;
  const query: ProductQuery = {
    from: 0,
    limit: DEFAULT_LIMIT,
    ...filters,
  };
  const { items } = await getRoListings(query, undefined);
  const faq = Array.isArray(row.faq_json) ? row.faq_json : [];
  const internalLinks = await getAppliedInternalLinksForSource(`/ro/lp/${slug}`);

  return (
    <article className="mx-auto max-w-4xl px-4 py-8">
      {preview && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Preview mode — draft/review content. Remove <code className="rounded bg-amber-100 px-1">?preview=1</code> for public view.
        </div>
      )}
        <h1 className="text-3xl font-bold text-slate-900">{row.h1 ?? row.title ?? slug}</h1>
        {row.intro_md != null && row.intro_md !== "" && (
          <div className="prose prose-slate mt-4" dangerouslySetInnerHTML={{ __html: mdToHtml(row.intro_md) }} />
        )}
        {faq.length > 0 && (
          <section className="mt-8" aria-label="Întrebări frecvente">
            <h2 className="text-xl font-semibold text-slate-900">Întrebări frecvente</h2>
            <ul className="mt-2 space-y-2">
              {faq.map((item: unknown, i: number) => {
                const q = typeof item === "object" && item != null && "question" in item ? String((item as { question: string }).question) : String(item);
                const a = typeof item === "object" && item != null && "answer" in item ? String((item as { answer: string }).answer) : "";
                return (
                  <li key={i} className="rounded border border-slate-200 p-3">
                    <strong className="text-slate-800">{q}</strong>
                    {a && <p className="mt-1 text-slate-600">{a}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {items.length > 0 && (
          <section className="mt-8" aria-label="Listings">
            <h2 className="text-xl font-semibold text-slate-900">Anunțuri</h2>
            <ul className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item: Record<string, unknown>) => (
                <li key={String(item.id)} className="rounded border border-slate-200 p-3">
                  <a href={String(item.url ?? "#")} className="font-medium text-slate-800 hover:underline">
                    {String(item.title ?? "")}
                  </a>
                  {item.starting_price_ron != null && (
                    <p className="text-sm text-slate-600">{Number(item.starting_price_ron)} Lei</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      {internalLinks.length > 0 && (
        <section className="mt-8" aria-label="Resurse utile">
          <h2 className="text-xl font-semibold text-slate-900">Resurse utile</h2>
          <ul className="mt-2 space-y-1">
            {internalLinks.map((link, i) => (
              <li key={i}>
                <a href={link.target_url} className="text-slate-700 underline hover:text-slate-900">
                  {link.anchor}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((item: unknown) => {
                const q = typeof item === "object" && item != null && "question" in item ? (item as { question: string }).question : String(item);
                const a = typeof item === "object" && item != null && "answer" in item ? (item as { answer: string }).answer : "";
                return { "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } };
              }),
            }),
          }}
        />
      )}
    </article>
  );
}

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3 class=\"text-lg font-semibold mt-4\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class=\"text-xl font-semibold mt-4\">$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class=\"text-2xl font-bold mt-4\">$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p class=\"mt-2\">")
    .replace(/\n/g, "<br />");
}
