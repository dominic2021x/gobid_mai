/**
 * Body type keywords -> canonical slug (berlina|suv|break|hatchback|etc).
 */
import type { AutoBodyType } from "@/lib/taxonomy/ro/attributes";

export const BODY_TYPE_SYNONYMS: Record<string, AutoBodyType> = {
  berlina: "berlina",
  sedan: "berlina",
  suv: "suv",
  "suv-4x4": "suv",
  "4x4": "suv",
  break: "break",
  combi: "break",
  wagon: "break",
  hatchback: "hatchback",
  hatch: "hatchback",
  coupe: "coupe",
  cabrio: "cabrio",
  cabriolet: "cabrio",
  decapotabila: "cabrio",
  van: "van",
  minivan: "minivan",
  monovolume: "minivan",
  pickup: "pickup",
  camion: "camion",
  camionet: "pickup",
};
