"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigateBackFromListingDetail } from "@/lib/ro/listingDetailBackNavigation";

export interface BackButtonProps extends React.ComponentProps<typeof Button> {
  /** Text lângă animație (implicit ca în design: „Back”) */
  label?: string;
  /** Dacă nu există istoric de navigat înapoi */
  fallbackHref?: string;
  /**
   * Dacă e setat, încearcă mai întâi reconstruirea /ro?… din starea salvată la deschiderea din listă
   * (același listingId), apoi history.back, apoi fallbackHref.
   */
  roListingReturnListingId?: string;
}

export function BackButton({
  label = "Back",
  fallbackHref = "/",
  roListingReturnListingId,
  className,
  onClick,
  ...props
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const id = roListingReturnListingId?.trim();
    if (id) {
      navigateBackFromListingDetail(router, { currentListingId: id, fallbackHref });
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <Button
      type="button"
      aria-label={label}
      className={cn("group relative overflow-hidden", className)}
      onClick={handleClick}
      {...props}
    >
      <span className="w-20 translate-x-2 transition-opacity duration-500 group-hover:opacity-0">
        {label}
      </span>
      <i className="absolute inset-0 z-10 grid w-1/4 place-items-center bg-primary-foreground/15 transition-all duration-500 group-hover:w-full not-italic">
        <ArrowLeft
          className="opacity-60"
          size={16}
          strokeWidth={2}
          aria-hidden="true"
        />
      </i>
    </Button>
  );
}
