import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Termeni și Condiții | gobid.ro",
  description:
    "Termenii și condițiile de utilizare a platformei gobid.ro. Citește regulile pentru crearea contului, participarea la licitații și utilizarea serviciilor.",
};

export default async function TermeniPage() {
  const html = await getLegalHtml("termeni-si-conditii");
  return (
    <LegalMarkdownPage
      title="Termeni și Condiții gobid.ro"
      description="Folosirea platformei implică acceptarea integrală a acestor Termeni și Condiții. Vă recomandăm să îi parcurgeți cu atenție înainte de a vă crea un cont sau de a participa la licitații."
      html={html}
    />
  );
}
