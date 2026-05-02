import { unstable_noStore as noStore } from "next/cache";
import DashboardAuthLayout from "./DashboardAuthLayout";

/** Dashboard: niciodată HTML/RSC static sau Data Cache partajat — date per utilizator / sesiune. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  return <DashboardAuthLayout>{children}</DashboardAuthLayout>;
}
