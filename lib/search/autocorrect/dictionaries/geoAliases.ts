/**
 * Romanian geo aliases for autocorrect: abbreviations and common variants.
 * Alias -> canonical (must exist in taxonomy as county or city).
 */

export const GEO_ALIASES: Record<string, string> = {
  buc: "bucuresti",
  bucurest: "bucuresti",
  braso: "brasov",
  "cluj-napoca": "cluj",
  timisoara: "timis",
  galat: "galati",
  pitesti: "arges",
  targoviste: "dambovita",
  "targu-jiu": "gorj",
  drobeta: "mehedinti",
  "baia-mare": "maramures",
  slatina: "olt",
  zalau: "salaj",
  "satu-mare": "satu mare",
  ramnicu: "valcea",
  "ramnicu-valcea": "valcea",
  focsani: "vrancea",
};
