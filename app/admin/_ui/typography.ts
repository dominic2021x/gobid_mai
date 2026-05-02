/**
 * Admin Design System — typography
 * Inter font, consistent sizes
 */

export const fontSizes = {
  xs: "text-xs",   // 12px
  sm: "text-sm",   // 14px
  base: "text-base", // 16px
  lg: "text-lg",   // 18px
  xl: "text-xl",   // 20px
  "2xl": "text-2xl", // 24px
  "3xl": "text-3xl", // 30px
} as const;

export const fontWeights = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
} as const;

export const textColors = {
  primary: "text-slate-900",
  secondary: "text-slate-600",
  muted: "text-slate-500",
  inverse: "text-white",
} as const;
