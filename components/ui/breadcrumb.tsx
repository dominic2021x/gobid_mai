"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import * as React from "react";

export function Breadcrumb({
  className,
  ...props
}: React.ComponentProps<"nav">): React.ReactElement {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  );
}

export function BreadcrumbList({
  className,
  ...props
}: React.ComponentProps<"ol">): React.ReactElement {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-1.5 break-words text-sm text-inherit sm:gap-2.5",
        className
      )}
      data-slot="breadcrumb-list"
      {...props}
    />
  );
}

export function BreadcrumbItem({
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      data-slot="breadcrumb-item"
      {...props}
    />
  );
}

export function BreadcrumbLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>): React.ReactElement {
  return (
    <Link
      className={cn(
        "rounded-sm text-inherit transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
        className
      )}
      data-slot="breadcrumb-link"
      {...props}
    />
  );
}

export function BreadcrumbPage({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-current="page"
      className={cn("font-medium text-inherit", className)}
      data-slot="breadcrumb-page"
      {...props}
    />
  );
}

export function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li
      aria-hidden="true"
      className={cn("opacity-80 [&>svg]:size-4", className)}
      data-slot="breadcrumb-separator"
      role="presentation"
      {...props}
    >
      {children ?? (
        <ChevronRight className="size-4 shrink-0 text-inherit opacity-60" />
      )}
    </li>
  );
}

export function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={className}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">Mai multe</span>
    </span>
  );
}
