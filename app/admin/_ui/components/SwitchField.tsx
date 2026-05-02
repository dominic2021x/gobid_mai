"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SwitchFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => Promise<{ value: boolean; eventId?: string } | null>;
  disabled?: boolean;
  warning?: string;
  className?: string;
}

export function SwitchField({
  label,
  description,
  checked,
  onToggle,
  disabled = false,
  warning,
  className,
}: SwitchFieldProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = disabled || isLoading;

  const handleChange = async () => {
    const newChecked = !checked;
    setError(null);
    setIsLoading(true);
    try {
      const result = await onToggle(newChecked);
      if (result === null) {
        setError("Failed to update");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const id = `switch-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={cn("rounded-lg border border-[#DADCE0] bg-white px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium text-[#202124]" htmlFor={id}>
            {label}
          </label>
          {description && (
            <p className="mt-0.5 text-sm text-[#5F6368]">{description}</p>
          )}
          {warning && (
            <p className="mt-1 text-xs text-[#FBBC04]">{warning}</p>
          )}
          {error && (
            <p className="mt-1 text-xs text-[#EA4335]" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={`${label}: ${checked ? "on" : "off"}`}
            disabled={isDisabled}
            onClick={handleChange}
            className={cn(
              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:ring-offset-2",
              isDisabled && "cursor-not-allowed opacity-60",
              checked ? "bg-[#34A853]" : "bg-[#E8EAED]"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                checked ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
