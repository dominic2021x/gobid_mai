"use client";

import { useEffect, useState } from "react";

export type ManualFormImageItem = string | File;

/**
 * Miniatură din URL sau din fișier local (preview real, nu icon generic).
 */
export function ManualFormImageThumb({
  image,
  className = "h-full w-full object-cover",
}: {
  image: ManualFormImageItem;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(() => (typeof image === "string" ? image : null));

  useEffect(() => {
    if (typeof image === "string") {
      setSrc(image);
      return;
    }
    if (image instanceof File && image.type.startsWith("image/")) {
      const u = URL.createObjectURL(image);
      setSrc(u);
      return () => URL.revokeObjectURL(u);
    }
    setSrc(null);
  }, [image]);

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <i className="ri-image-2-line text-2xl opacity-60" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const el = e.target as HTMLImageElement;
        el.style.display = "none";
      }}
    />
  );
}
