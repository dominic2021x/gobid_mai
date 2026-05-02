"use client";

import React from "react";

export type CheckboxOption = { value: string; label: string };

type Props = {
  options: CheckboxOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel?: string;
  name?: string;
  className?: string;
  optionClassName?: string;
};

/**
 * Checkbox group for multi-select filter (e.g. "Mai multe detalii").
 * "Toate" option clears selection for this group.
 */
export function CheckboxGroup({
  options,
  selected,
  onChange,
  allLabel = "Toate",
  name = "filter-checkbox",
  className = "space-y-2",
  optionClassName = "flex cursor-pointer items-center gap-2 text-sm text-gray-700",
}: Props) {
  const noneSelected = selected.length === 0;
  return (
    <div className={className}>
      <label className={optionClassName}>
        <input
          type="checkbox"
          name={name}
          checked={noneSelected}
          onChange={() => onChange([])}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {allLabel}
      </label>
      {options.map(({ value, label }) => {
        const checked = selected.includes(value);
        return (
          <label key={value} className={optionClassName}>
            <input
              type="checkbox"
              name={name}
              checked={checked}
              onChange={() => {
                if (checked) {
                  onChange(selected.filter((s) => s !== value));
                } else {
                  onChange([...selected, value]);
                }
              }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
