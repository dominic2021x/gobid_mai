"use client";

import * as React from "react";
import { Select } from "@base-ui/react/select";

export type RoSortOption = { value: string; label: string };

export type RoSortSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: RoSortOption[];
  isDarkMode: boolean;
  /** `compact` = rând mobil (înălțimi mici, text xs/sm). */
  size?: "default" | "compact";
  id?: string;
};

function ChevronUpDownIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
      {...props}
    >
      <path d="M0.5 4.5L4 1.5L7.5 4.5" />
      <path d="M0.5 7.5L4 10.5L7.5 7.5" />
    </svg>
  );
}

function CheckIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="currentColor" width="10" height="10" viewBox="0 0 10 10" aria-hidden {...props}>
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}

/**
 * Sortare listări /ro — Base UI Select (același pattern ca select-1), doar pentru „Sortare:”.
 */
export function RoSortSelect({
  value,
  onValueChange,
  options,
  isDarkMode,
  size = "default",
  id,
}: RoSortSelectProps) {
  /** Base UI generează id-uri pe trigger dinamic; fără id stabil pe Root apare hydration mismatch SSR/client. */
  const rootId = id ?? (size === "compact" ? "ro-sort-select-compact" : "ro-sort-select-default");

  const items = React.useMemo(
    () => options.map((o) => ({ label: o.label, value: o.value })),
    [options],
  );

  const triggerClass =
    size === "compact"
      ? isDarkMode
        ? "flex h-8 min-w-0 w-full max-w-full items-center justify-between gap-1 rounded-md border-2 border-gray-600 bg-gray-700 py-1 pl-1.5 pr-1.5 text-xs font-medium text-white select-none hover:bg-gray-600/90 data-[popup-open]:bg-gray-600 sm:gap-2 sm:rounded-lg sm:py-1.5 sm:pl-2 sm:pr-2.5 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-orange-500"
        : "flex h-8 min-w-0 w-full max-w-full items-center justify-between gap-1 rounded-md border-2 border-gray-200 bg-white py-1 pl-1.5 pr-1.5 text-xs font-medium text-gray-900 select-none hover:bg-gray-50 data-[popup-open]:bg-gray-50 sm:gap-2 sm:rounded-lg sm:py-1.5 sm:pl-2 sm:pr-2.5 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-orange-500"
      : isDarkMode
        ? "flex h-10 w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border-2 border-gray-600 bg-gray-700 py-2.5 pl-3 pr-3 text-sm font-medium text-white select-none hover:border-orange-500/50 data-[popup-open]:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-orange-500"
        : "flex h-10 w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border-2 border-gray-200 bg-white py-2.5 pl-3 pr-3 text-sm font-medium text-gray-900 select-none hover:border-orange-400 data-[popup-open]:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-orange-500";

  const popupClass = isDarkMode
    ? "group max-h-[var(--available-height)] origin-[var(--transform-origin)] overflow-y-auto rounded-md bg-neutral-900 py-1 text-gray-100 shadow-lg shadow-black/40 outline outline-1 outline-gray-600 transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100 data-[side=none]:data-[starting-style]:transition-none"
    : "group max-h-[var(--available-height)] origin-[var(--transform-origin)] overflow-y-auto rounded-md bg-[canvas] py-1 text-gray-900 shadow-lg shadow-gray-200 outline outline-1 outline-gray-200 transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100 data-[side=none]:data-[starting-style]:transition-none dark:shadow-none dark:-outline-offset-1 dark:outline-gray-300";

  const itemHighlight = isDarkMode
    ? "data-[highlighted]:text-gray-50 data-[highlighted]:before:bg-orange-600"
    : "data-[highlighted]:text-gray-50 data-[highlighted]:before:bg-gray-900";

  return (
    <Select.Root
      id={rootId}
      modal={false}
      items={items}
      value={value}
      onValueChange={(v) => {
        if (v != null && v !== "") onValueChange(String(v));
      }}
    >
      <Select.Trigger className={triggerClass}>
        <span className="min-w-0 flex-1 truncate text-left">
          <Select.Value />
        </span>
        <Select.Icon className="flex shrink-0 opacity-70">
          <ChevronUpDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-[200] outline-none" sideOffset={8}>
          <Select.ScrollUpArrow className="top-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute before:top-[-100%] before:left-0 before:h-full before:w-full before:content-[''] data-[direction=down]:bottom-0 data-[direction=down]:before:bottom-[-100%]" />
          <Select.Popup className={popupClass}>
            {options.map(({ label, value: itemValue }) => (
              <Select.Item
                key={itemValue}
                value={itemValue}
                className={`grid min-w-[var(--anchor-width)] cursor-default grid-cols-[0.75rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4 data-[highlighted]:relative data-[highlighted]:z-0 ${itemHighlight} data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm`}
              >
                <Select.ItemIndicator className="col-start-1">
                  <CheckIcon className="size-3" />
                </Select.ItemIndicator>
                <Select.ItemText className="col-start-2">{label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
          <Select.ScrollDownArrow className="bottom-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute before:top-[-100%] before:left-0 before:h-full before:w-full before:content-[''] data-[direction=down]:bottom-0 data-[direction=down]:before:bottom-[-100%]" />
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
