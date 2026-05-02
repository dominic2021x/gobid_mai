"use client";

import React from "react";
import { CheckboxGroup } from "./CheckboxGroup";
import { RadioGroup } from "./RadioGroup";
import type { CheckboxOption } from "./CheckboxGroup";
import type { RadioOption } from "./RadioGroup";

export type FilterGroupId = "mai_multe_detalii" | "tip_teren";

type FilterGroupProps =
  | {
      groupId: "mai_multe_detalii";
      title: string;
      options: CheckboxOption[];
      selected: string[];
      onChange: (selected: string[]) => void;
      allLabel?: string;
    }
  | {
      groupId: "tip_teren";
      title: string;
      options: RadioOption[];
      value: string;
      onChange: (value: string) => void;
      allLabel?: string;
      name: string;
    };

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500";

/**
 * Renders a filter group with deterministic control type:
 * - mai_multe_detalii => checkbox group
 * - tip_teren => radio group
 * Used by admin (and optionally /ro) for 1:1 UI.
 */
export function FilterGroup(props: FilterGroupProps) {
  if (props.groupId === "mai_multe_detalii") {
    return (
      <div>
        <label className={LABEL_CLASS}>{props.title}</label>
        <CheckboxGroup
          options={props.options}
          selected={props.selected}
          onChange={props.onChange}
          allLabel={props.allLabel ?? "Toate detaliile"}
          name="filter-mai-multe-detalii"
        />
      </div>
    );
  }
  return (
    <div>
      <label className={LABEL_CLASS}>{props.title}</label>
      <RadioGroup
        options={props.options}
        value={props.value}
        onChange={props.onChange}
        allLabel={props.allLabel ?? "Toate tipurile"}
        name={props.name}
      />
    </div>
  );
}
