import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica de Licitații | gobid.ro",
  description:
    "Regulile licitațiilor pe gobid.ro: mecanism ofertare, validitate ofertă, obligații câștigător, sancțiuni, prelungire automată.",
};

export default async function PoliticaLicitatiiPage() {
  const html = await getLegalHtml("politica-licitatii");
  return (
    <LegalMarkdownPage
      title="Politica de Licitații"
      description="Reguli complete privind participarea la licitații, ofertarea, prelungirea automată și responsabilitățile părților."
      html={html}
    />
  );
}
