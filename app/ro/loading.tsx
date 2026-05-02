import RoRouteLoadingShell from "@/components/loading/RoRouteLoadingShell";

/** Route-level fallback while `RoListingsData` streams — static shell, no animation. */
export default function RoLoading() {
  return <RoRouteLoadingShell />;
}
