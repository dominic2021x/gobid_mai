import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica Cookie-uri | gobid.ro",
  description:
    "Politica privind cookie-urile gobid.ro. Tipuri de cookie-uri, consimțământ, Google Ads, analytics și cum vă puteți opri.",
};

export default async function PoliticaCookiesPage() {
  const html = await getLegalHtml("politica-cookies");
  return (
    <LegalMarkdownPage
      title="Politica privind Cookie-urile"
      description="Informații despre utilizarea cookie-urilor pe gobid.ro, inclusiv consimțământ, retragere și setări."
      html={html}
    />
  );
}
