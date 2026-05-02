import { Suspense } from "react";
import RoRouteLoadingShell from "@/components/loading/RoRouteLoadingShell";
import RoListServer from "./RoListServer";

export default async function RoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await (searchParams ?? Promise.resolve({}));
  return (
    <Suspense fallback={<RoRouteLoadingShell />}>
      <RoListServer searchParams={params} />
    </Suspense>
  );
}
