import type { Metadata } from "next";
import LegalLayoutClient from "./LegalLayoutClient";
import { LEGAL_PAGES } from "@/lib/legal-pages";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gobid.ro";

export const metadata: Metadata = {
  title: {
    default: "Documente legale | gobid.ro",
    template: "%s | gobid.ro",
  },
  description: "Termeni și condiții, politici de confidențialitate, cookie-uri și alte documente legale gobid.ro",
  alternates: {
    canonical: `${SITE_URL}/legal`,
  },
};

const NAV_ITEMS = [
  { href: "/legal", label: "Index" },
  ...LEGAL_PAGES.map((p) => ({ href: p.path, label: p.title })),
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <LegalLayoutClient navItems={NAV_ITEMS}>
      {children}
    </LegalLayoutClient>
  );
}
