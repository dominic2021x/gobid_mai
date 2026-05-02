import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gobid.ro";
const LEGAL_EMAIL = process.env.LEGAL_CONTACT_EMAIL ?? "legal@gobid.ro";

export const metadata: Metadata = {
  title: "Date de identificare",
  description: "Informații de identificare DMK WEB STRATEGY SRL, operatorul platformei gobid.ro",
  alternates: {
    canonical: `${SITE_URL}/legal/date-identificare`,
  },
};

export default function DateIdentificarePage() {
  return (
    <article className="prose prose-lg max-w-none dark:prose-invert">
      <p className="text-sm text-gray-500 dark:text-gray-400">Ultima actualizare: 2026-03-03</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Date de identificare</h1>
      <p className="lead">
        Conform Legii nr. 365/2002 privind comerțul electronic și Regulamentului (UE) 2022/2065 (DSA).
      </p>
      <section className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">Operator</h2>
        <p className="font-semibold">DMK WEB STRATEGY SRL</p>
        <ul className="list-none space-y-1 pl-0">
          <li><strong>Sediu social:</strong> Bulevardul Decebal nr. 18, Craiova, România</li>
          <li><strong>CUI:</strong> 54080033</li>
          <li><strong>Registrul Comerțului:</strong> J2026012709003</li>
          <li><strong>Email contact:</strong> <a href={`mailto:${LEGAL_EMAIL}`} className="text-blue-600 hover:underline dark:text-blue-400">{LEGAL_EMAIL}</a></li>
        </ul>
      </section>
      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        Pentru documentele legale complete, consultați{" "}
        <Link href="/legal/termeni-si-conditii" className="text-blue-600 hover:underline dark:text-blue-400">Termenii și Condițiile</Link>,
        {" "}<Link href="/legal/politica-confidentialitate" className="text-blue-600 hover:underline dark:text-blue-400">Politica de Confidențialitate</Link>{" "}
        și{" "}<Link href="/legal/politica-cookies" className="text-blue-600 hover:underline dark:text-blue-400">Politica Cookie-uri</Link>.
      </p>
    </article>
  );
}
