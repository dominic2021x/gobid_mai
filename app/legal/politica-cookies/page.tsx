import type { Metadata } from "next";
import Link from "next/link";
import { getLegalHtml } from "@/lib/legal-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gobid.ro";

export const metadata: Metadata = {
  title: "Politica Cookie-uri",
  description: "Politica privind cookie-urile pe gobid.ro",
  alternates: {
    canonical: `${SITE_URL}/legal/politica-cookies`,
  },
};

export default async function PoliticaCookiesPage() {
  const html = await getLegalHtml("politica-cookies");
  return (
    <article className="prose prose-lg max-w-none dark:prose-invert">
      <p className="text-sm text-gray-500 dark:text-gray-400">Ultima actualizare: 2026-03-03</p>
      <p className="text-sm">
        Operator: <Link href="/legal/date-identificare" className="text-blue-600 hover:underline dark:text-blue-400">Date de identificare</Link>
      </p>
      <div
        className="legal-content [&_h1]:mb-4 [&_h1]:mt-8 [&_h2]:mb-3 [&_h2]:mt-6 [&_p]:mb-3 [&_ul]:my-3 [&_ol]:my-3 [&_table]:my-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
