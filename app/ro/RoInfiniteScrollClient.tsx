"use client";

import { useEffect, useRef } from "react";

export type RoInfiniteScrollSentinelOptions = {
  enabled: boolean;
  hasMore: boolean;
  /** True when more items exist in the in-memory list before fetching the next API page. */
  hasLocalSliceRemaining: boolean;
  isLoadingRemote: boolean;
  onRevealLocal: () => void;
  onLoadRemote: () => void | Promise<void>;
  rootMargin?: string;
};

/**
 * IntersectionObserver on a sentinel: expand local window first, then call API load-more.
 * Only client-side loading path for the main grid (beyond the server-rendered first page).
 */
export function useRoInfiniteScrollSentinel(options: RoInfiniteScrollSentinelOptions) {
  const {
    enabled,
    hasMore,
    hasLocalSliceRemaining,
    isLoadingRemote,
    onRevealLocal,
    onLoadRemote,
    rootMargin = "200px",
  } = options;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onRevealLocalRef = useRef(onRevealLocal);
  const onLoadRemoteRef = useRef(onLoadRemote);
  onRevealLocalRef.current = onRevealLocal;
  onLoadRemoteRef.current = onLoadRemote;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !enabled || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (hasLocalSliceRemaining) {
          onRevealLocalRef.current();
          return;
        }
        if (!isLoadingRemote) {
          void onLoadRemoteRef.current();
        }
      },
      { rootMargin, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, hasMore, hasLocalSliceRemaining, isLoadingRemote, rootMargin]);

  return sentinelRef;
}
