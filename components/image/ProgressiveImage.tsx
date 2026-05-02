"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ImageFocalEntry } from "@/lib/image/focal-types";
import {
  CDN_IMAGE_FALLBACK_SRC,
  CDN_IMAGE_SIZES_GRID,
  blurPlaceholderTransformOptions,
  getCdnImageUrl,
  heroTransformOptions,
  listingGridTransformOptions,
  type CdnImageOptions,
} from "@/lib/image/cdn";
import { cn } from "@/lib/utils";

export type ProgressiveImageVariant = "grid" | "hero";

export type ProgressiveImageProps = {
  /** Raw product image URL/key (same as passed to `getCdnImageUrl`). */
  source: string;
  /**
   * Opțional: URL final deja calculat (ex. `buildResolvedLiveBidImageUrls`).
   * Altfel `src` = transform CDN (`getCdnImageUrl`) — același string la SSR și client dacă env e aliniat.
   */
  resolvedFullSrc?: string | null;
  variant: ProgressiveImageVariant;
  updatedAt?: string | number | Date | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  loading?: "lazy";
  /** Default true. Set false for thumbnails / icons. */
  enableBlur?: boolean;
  /** Optional: full transform instead of grid/hero presets (advanced). */
  fullOptionsOverride?: CdnImageOptions;
  /** From `uploaded_images` / `image_focal_by_url` (smart crop). */
  focal?: ImageFocalEntry | null;
  imgClassName?: string;
};

const DEFAULT_SIZES_HERO = "(max-width: 1024px) 100vw, 65vw";

/**
 * LQIP: blur layer + `next/image`. `src` folosește direct URL-ul redimensionat (Cloudflare `/cdn-cgi/image/`)
 * când e configurat — nu mai încărcăm fișierul integral din R2 la primul paint (înainte se folosea URL brut doar ca să evităm mismatch la hidratare).
 */
export function ProgressiveImage({
  source,
  resolvedFullSrc,
  variant,
  updatedAt,
  alt,
  sizes,
  priority,
  loading,
  enableBlur = true,
  fullOptionsOverride,
  focal,
  imgClassName,
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setLoaded(false);
  }, [source]);

  const effectiveSource = loadFailed ? CDN_IMAGE_FALLBACK_SRC : source;
  const effectiveResolved = loadFailed ? null : resolvedFullSrc;

  const fullSrc = useMemo(() => {
    const resolved = typeof effectiveResolved === "string" ? effectiveResolved.trim() : "";
    if (resolved) return resolved;
    if (fullOptionsOverride) return getCdnImageUrl(effectiveSource, fullOptionsOverride);
    return variant === "grid"
      ? getCdnImageUrl(effectiveSource, listingGridTransformOptions(updatedAt, focal ?? null))
      : getCdnImageUrl(effectiveSource, heroTransformOptions(updatedAt, focal ?? null));
  }, [effectiveSource, effectiveResolved, variant, updatedAt, fullOptionsOverride, focal]);

  const imgSrc = useMemo(() => {
    const resolved = typeof effectiveResolved === "string" ? effectiveResolved.trim() : "";
    if (resolved) return resolved;
    return fullSrc;
  }, [effectiveResolved, fullSrc]);

  const blurSrc = useMemo(() => {
    if (!enableBlur) return null;
    const s = effectiveSource.trim();
    if (!s || (s.startsWith("/") && !s.startsWith("//"))) return null;
    return getCdnImageUrl(effectiveSource, blurPlaceholderTransformOptions(updatedAt, focal ?? null));
  }, [effectiveSource, enableBlur, updatedAt, focal]);

  const resolvedSizes =
    sizes ?? (variant === "grid" ? CDN_IMAGE_SIZES_GRID : DEFAULT_SIZES_HERO);

  /** Fără poartă „hydrated”: altfel după primul useEffect trecem la stratul blur + opacity-0 pe main până la onLoad — imaginea pare că dispare sau se încarcă din nou după ce cardul e deja vizibil. */
  const showBlurLayer = Boolean(blurSrc && blurSrc !== fullSrc);

  const onImageError = () => {
    setLoadFailed((prev) => {
      if (prev) return prev;
      return true;
    });
  };

  const imageCommon = {
    src: imgSrc,
    alt,
    fill: true as const,
    unoptimized: true as const,
    sizes: resolvedSizes,
    priority,
    fetchPriority: priority ? ("high" as const) : undefined,
    /** Aliniază cu comportamentul implicit next/image (priority → eager + fetchPriority high). */
    loading: (priority ? undefined : loading ?? "lazy") as "lazy" | undefined,
    suppressHydrationWarning: true as const,
    onError: onImageError,
  };

  if (!showBlurLayer) {
    return (
      <Image {...imageCommon} className={cn("object-cover", imgClassName)} />
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- blur placeholder only */}
      <img
        src={blurSrc!}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover blur-2xl transition-opacity duration-500 ease-out scale-105"
        style={{ opacity: loaded ? 0 : 1 }}
      />
      <Image
        {...imageCommon}
        onLoad={() => setLoaded(true)}
        onLoadingComplete={() => setLoaded(true)}
        className={cn(
          "z-10 object-cover transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName
        )}
      />
    </>
  );
}
