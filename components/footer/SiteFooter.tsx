import Link from "next/link";
import Image from "next/image";

interface SiteFooterProps {
  isDarkMode?: boolean;
}

const LEGAL_LINKS = [
  { href: "/legal/termeni-si-conditii", label: "Termeni și Condiții" },
  { href: "/legal/politica-confidentialitate", label: "Politica de Confidențialitate" },
  { href: "/legal/politica-confidentialitate", label: "Protecția datelor (GDPR)" },
  { href: "/legal/politica-cookies", label: "Politica Cookie-uri" },
  { href: "/legal/date-identificare", label: "Date de identificare" },
  { href: "/legal", label: "Toate documentele" },
] as const;

export default function SiteFooter({ isDarkMode = false }: SiteFooterProps) {
  const textCls = isDarkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-900";

  return (
    <footer
      className={`mt-auto border-t py-6 px-4 sm:px-6 lg:px-8 ${
        isDarkMode ? "border-white/10" : "border-gray-200"
      }`}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/contact" className={`text-sm ${textCls}`}>
            Contact
          </Link>
          {LEGAL_LINKS.map(({ href, label }) => (
            <Link key={label} href={href} className={`text-sm ${textCls}`}>
              {label}
            </Link>
          ))}
        </div>
        <div
          className={`mt-4 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          <p className={isDarkMode ? "text-gray-400" : "text-gray-700"}>
            © 2026 gobid.ro. Toate drepturile rezervate.
          </p>
          <p>Operat de DMK WEB STRATEGY SRL CUI 54080033</p>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
              <span>Proiectat și dezvoltat cu</span>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-[0.95em] w-[0.95em] fill-red-500 animate-[heartBeat_1.15s_ease-in-out_infinite]"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.08 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span>de</span>
            </span>
            <a
              href="https://www.noerror.ro/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NOERROR (deschide în tab nou)"
            >
              <Image
                src="/reclame/noerror-logo.png"
                alt="NOError"
                width={128}
                height={28}
                className={`w-auto ${isDarkMode ? "brightness-0 invert" : ""}`}
                style={{ height: 16 }}
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
