import LegalMarkdownPage from "@/components/LegalMarkdownPage";
import { getLegalHtml } from "@/lib/legal-content";

export const metadata = {
  title: "Politica de Plăți și Rambursări | gobid.ro",
  description:
    "Politica de plăți gobid.ro: Netopia, metode de plată, condiții de rambursare, facturare, chargeback și fraudă.",
};

export default async function PoliticaPlatiPage() {
  const html = await getLegalHtml("politica-plati");
  return (
    <LegalMarkdownPage
      title="Politica de Plăți și Rambursări"
      description="Informații despre procesarea plăților prin Netopia, rambursări, facturare și proceduri în caz de dispute."
      html={html}
    />
  );
}
