import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica AI și Asistent Virtual | gobid.ro",
  description:
    "Politica privind utilizarea AI pe gobid.ro: asistent virtual, limitări, responsabilitate utilizator, conformitate AI Act.",
};

export default async function PoliticaAIPage() {
  const html = await getLegalHtml("politica-ai");
  return (
    <LegalMarkdownPage
      title="Politica privind utilizarea AI și Asistentul Virtual"
      description="Informații despre funcționalitățile bazate pe inteligență artificială, limitări și responsabilități."
      html={html}
    />
  );
}
