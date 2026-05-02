import Link from "next/link";
import { LEGAL_PAGES } from "@/lib/legal-pages";

export default function LegalIndexPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          Documente legale gobid.ro
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Toate documentele legale ale platformei. Informațiile privind protecția datelor personale (GDPR) și drepturile vizatului se găsesc în{" "}
          <Link href="/legal/politica-confidentialitate" className="text-blue-600 underline dark:text-blue-400">
            Politica de Confidențialitate
          </Link>
          . Consultați{" "}
          <Link href="/legal/date-identificare" className="text-blue-600 underline dark:text-blue-400">
            datele de identificare
          </Link>{" "}
          pentru informații complete despre operator.
        </p>
      </header>
      <ul className="space-y-3">
        {LEGAL_PAGES.map(({ path, title }) => (
          <li key={path}>
            <Link
              href={path}
              className="flex items-center gap-2 text-base font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <i className="ri-file-text-line" />
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
