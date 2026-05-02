import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";

const N = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Potrivire rapidă pe lista de orașe (fără sate) — fără județ; Nominatim adaugă „Oraș, Județ” în sugestiile de pe server.
 */
export function staticRomanianCityHints(query: string, max = 8): string[] {
  const q = N(query);
  if (q.length < 2) return [];
  const out: string[] = [];
  for (const city of ROMANIAN_CITIES) {
    const nc = N(city);
    if (nc.startsWith(q) || (q.length >= 3 && nc.includes(q))) {
      out.push(city);
      if (out.length >= max) break;
    }
  }
  return out;
}
