import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica de Moderare și Conținut Interzis | gobid.ro",
  description:
    "Politica de moderare gobid.ro: conținut ilegal, bunuri interzise, procedură raportare, notice-and-takedown, DSA.",
};

export default async function PoliticaModerarePage() {
  const html = await getLegalHtml("politica-moderare");
  return (
    <LegalMarkdownPage
      title="Politica de Moderare și Conținut Interzis"
      description="Reguli privind conținutul admis pe platformă, procedura de raportare și sancțiunile pentru încălcări."
      html={html}
    />
  );
}
