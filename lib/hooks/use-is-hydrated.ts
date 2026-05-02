import { useEffect, useState } from "react";

/**
 * `false` on the server and on the **first** client render (matches SSR HTML);
 * `true` only after `useEffect` runs. Safer than `useSyncExternalStore` for hydration
 * gates in Next.js App Router (avoids early “hydrated” in some React 19 paths).
 */
export function useIsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
