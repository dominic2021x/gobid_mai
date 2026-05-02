import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica de Confidențialitate cu privire la prelucrarea datelor cu caracter personal | gobid.ro",
  description:
    "Politica de confidențialitate gobid.ro: prelucrarea datelor cu caracter personal, drepturile vizatului (GDPR), operator, contact.",
};

export default async function PoliticaConfidentialitatePage() {
  const html = await getLegalHtml("politica-confidentialitate");
  return (
    <LegalMarkdownPage
      title="Politica de Confidențialitate cu privire la prelucrarea datelor cu caracter personal"
      description="Informații despre prelucrarea datelor cu caracter personal, drepturile dumneavoastră (GDPR) și contactul operatorului. gobid.ro — DMK WEB STRATEGY SRL."
      html={html}
    />
  );
}
