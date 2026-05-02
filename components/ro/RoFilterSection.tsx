"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Secțiune colapsabilă pentru sidebar-ul /ro — același layout ca în bundle-ul Marketplace (px-4, hover muted).
 */
export function RoFilterSection({
  title,
  children,
  defaultOpen = true,
  isDarkMode: _isDarkMode,
  className,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Păstrat pentru compatibilitate API; tema folosește clase semantice + .dark pe document. */
  isDarkMode?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("border-b border-border", className)}>
      <CollapsibleTrigger
        type="button"
        className="hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-none"
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown className={cn("text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-150", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
