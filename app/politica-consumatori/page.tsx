import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica Drepturilor Consumatorilor | gobid.ro",
  description:
    "Drepturile consumatorilor pe gobid.ro: OUG 34/2014, drept de retragere 14 zile, garanție legală, Directiva Omnibus.",
};

export default async function PoliticaConsumatoriPage() {
  const html = await getLegalHtml("politica-consumatori");
  return (
    <LegalMarkdownPage
      title="Politica Drepturilor Consumatorilor"
      description="Informații privind drepturile consumatorilor în conformitate cu OUG 34/2014 și legislația europeană."
      html={html}
    />
  );
}
