import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calculator Inteligent Credit Ipotecar | gobid.ro",
  description: "Calculează rambursarea anticipată a creditului ipotecar. Descoperă câtă dobândă poți economisi și generează automat textul pentru bancă cu ajutorul AI.",
  keywords: "calculator credit ipotecar, rambursare anticipată, credit ipotecar, dobândă economisită, calculator credit, gobid",
};

export default function SmartMortgageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
