/** Allowed logical widths for signed delivery (matches design presets). */
export const DELIVERY_ALLOWED_WIDTHS = [300, 600, 1200] as const;
export type DeliveryWidth = (typeof DELIVERY_ALLOWED_WIDTHS)[number];

export const DELIVERY_ALLOWED_DPR = [1, 2] as const;
export type DeliveryDpr = (typeof DELIVERY_ALLOWED_DPR)[number];

export function isAllowedDeliveryWidth(w: number): w is DeliveryWidth {
  return (DELIVERY_ALLOWED_WIDTHS as readonly number[]).includes(w);
}

export function isAllowedDeliveryDpr(d: number): d is DeliveryDpr {
  return (DELIVERY_ALLOWED_DPR as readonly number[]).includes(d);
}
