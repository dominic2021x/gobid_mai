"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "header-body" | "header-body-footer";

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className, variant = "default" }: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[#DADCE0] bg-white shadow-sm",
        "transition-shadow hover:shadow-md",
        className
      )}
      role="article"
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn("border-b border-[#E8EAED] px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-[#202124]">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-sm text-[#5F6368]">{description}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("border-t border-[#E8EAED] bg-[#F8F9FA] px-5 py-3", className)}>
      {children}
    </div>
  );
}
