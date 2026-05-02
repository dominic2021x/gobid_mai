import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Mortgage | gobid.ro",
  description: "Calculator și asistent AI pentru rambursare anticipată credit ipotecar. Calculează economiile și generează textul pentru bancă.",
  keywords: "smart mortgage, rambursare anticipată, credit ipotecar, calculator credit, gobid",
};

export default function SmartMortgageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
