"use client";

import React from "react";

export type RadioOption = { value: string; label: string };

type Props = {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  allValue?: string;
  allLabel?: string;
  name: string;
  className?: string;
  optionClassName?: string;
};

/**
 * Radio group for single-select filter (e.g. "Tip teren").
 * "Toate tipurile" (or allLabel) clears the filter when value is allValue.
 */
export function RadioGroup({
  options,
  value,
  onChange,
  allValue = "all",
  allLabel = "Toate tipurile",
  name,
  className = "space-y-2",
  optionClassName = "flex cursor-pointer items-center gap-2 text-sm text-gray-700",
}: Props) {
  const isEmpty = !value || value === allValue;
  return (
    <div className={className}>
      <label className={optionClassName}>
        <input
          type="radio"
          name={name}
          checked={isEmpty}
          onChange={() => onChange(allValue)}
          className="border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {allLabel}
      </label>
      {options.map(({ value: optValue, label }) => (
        <label key={optValue} className={optionClassName}>
          <input
            type="radio"
            name={name}
            checked={value === optValue}
            onChange={() => onChange(optValue)}
            className="border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
