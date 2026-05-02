import type { Metadata } from "next";
import Link from "next/link";
import { getLegalHtml } from "@/lib/legal-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gobid.ro";

export const metadata: Metadata = {
  title: "Termeni import sursă externă (CSV) | gobid.ro",
  description:
    "Termeni suplimentari pentru importul anunțurilor din surse externe (CSV) și mandatul acordat platformei gobid.ro.",
  alternates: {
    canonical: `${SITE_URL}/legal/termeni-import-sursa-externa`,
  },
};

export default async function TermeniImportSursaExternaPage() {
  const html = await getLegalHtml("termeni-import-sursa-externa");
  return (
    <article className="prose prose-lg max-w-none dark:prose-invert">
      <p className="text-sm text-gray-500 dark:text-gray-400">Ultima actualizare: 2026-04-15</p>
      <p className="text-sm">
        Document conex:{" "}
        <Link href="/legal/termeni-si-conditii" className="text-blue-600 hover:underline dark:text-blue-400">
          Termeni și Condiții
        </Link>
        {" · "}
        <Link href="/legal/date-identificare" className="text-blue-600 hover:underline dark:text-blue-400">
          Date de identificare
        </Link>
      </p>
      <div
        className="legal-content [&_h1]:mb-4 [&_h1]:mt-8 [&_h2]:mb-3 [&_h2]:mt-6 [&_p]:mb-3 [&_ul]:my-3 [&_ol]:my-3 [&_table]:my-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
