/**
 * Extrage data și ora licitației din descriere folosind ChatGPT.
 * Folosit ca fallback când extragerea prin regex nu găsește date/ora.
 */

import { getOpenAIClient } from "./openai";
import type { ExtractedAuction } from "@/lib/extractAuctionFromDescription";
import { parseDateToISO } from "@/lib/extractAuctionFromDescription";

export interface AIExtractionResult {
  /** Data primei licitații în format DD.MM.YYYY sau YYYY-MM-DD */
  data_licitatie: string | null;
  /** Ora în format HH:MM (ex: 15:00) */
  ora_licitatie: string | null;
  /** A doua dată (pentru săptămânal: prima + 7 zile), DD.MM.YYYY sau YYYY-MM-DD */
  data_licitatie_2: string | null;
  /** true dacă licitațiile sunt zilnic „în orice zi” / ceas 24h */
  rolling_daily: boolean;
  /** Ziua săptămânii pentru „săptămânal, în zilele de joi”: 0=duminică, 1=luni, ..., 4=joi, 6=sâmbătă. null dacă nu e săptămânal. */
  rolling_weekly_weekday: number | null;
  /** Adresă menționată (opțional) */
  adresa: string | null;
}

function normalizeToISO(dateStr: string | null | undefined): string | null {
  if (!dateStr || !String(dateStr).trim()) return null;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return parseDateToISO(`${m[1]}/${m[2]}/${m[3]}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function normalizeTime(t: string | null | undefined): string | null {
  if (!t || !String(t).trim()) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Apelează ChatGPT pentru a extrage din descriere: data primei licitații, ora, (opțional) a doua dată, și dacă e rolling daily/weekly.
 * Returnează null dacă OpenAI nu e configurat sau răspunsul nu e valid JSON.
 */
export async function extractAuctionDateAndTimeWithAI(
  descriptionText: string
): Promise<ExtractedAuction | null> {
  const text = (descriptionText || "").trim();
  if (!text || text.length < 50) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const openai = getOpenAIClient();
    const userContent = `Extrage din textul de mai jos informațiile despre data și ora licitației.

Text descriere:
${text.slice(0, 4000)}

Răspunde DOAR cu un JSON valid, fără alt text, în acest format exact:
{
  "data_licitatie": "DD.MM.YYYY sau null dacă nu e menționată",
  "ora_licitatie": "HH:MM (ex: 15:00) sau null",
  "data_licitatie_2": "DD.MM.YYYY pentru a doua licitație (ex: când se repetă săptămânal = prima dată + 7 zile) sau null",
  "rolling_daily": false,
  "rolling_weekly_weekday": null sau 0-6 (0=duminică, 1=luni, 2=marți, 3=miercuri, 4=joi, 5=vineri, 6=sâmbătă) dacă scrie „săptămânal, în zilele de joi” etc.,
  "adresa": "adresa menționată sau null"
}

Reguli obligatorii:
- „în fiecare zi de miercuri” sau „în fiecare zi de joi” etc. = licitații SĂPTĂMÂNALE în acea zi (rolling_weekly_weekday: 3 pentru miercuri, 4 pentru joi etc.). NU pune rolling_daily: true. rolling_daily = true doar pentru „în fiecare zi” / „în orice zi” FĂRĂ nume de zi.
- „începând cu data de 14.01.2026, ora 12.00” = data_licitatie „14.01.2026”, ora_licitatie „12:00”. Dacă e săptămânal, data_licitatie_2 = prima dată + 7 zile (ex: 21.01.2026).
- „Prima licitație va avea loc pe 29.01.2026, la ora 15:00” = data_licitatie și ora_licitatie. „se vor repeta săptămânal, în zilele de joi” = rolling_weekly_weekday: 4, data_licitatie_2 = data_licitatie + 7 zile.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești un asistent care extrage din texte în română doar data și ora licitațiilor. IMPORTANT: „în fiecare zi de miercuri” = săptămânal miercuri (rolling_weekly_weekday: 3), NU zilnic. „În fiecare zi” fără nume de zi = rolling_daily. Răspunde exclusiv cu un obiect JSON valid, fără markdown.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as AIExtractionResult;

    const dateIso = normalizeToISO(parsed.data_licitatie);
    const dateIso2 = normalizeToISO(parsed.data_licitatie_2);
    const time = normalizeTime(parsed.ora_licitatie);

    const result: ExtractedAuction = {
      dateIso,
      time,
      address: parsed.adresa && String(parsed.adresa).trim().length > 5 ? String(parsed.adresa).trim().slice(0, 300) : null,
      timeEnd: null,
    };

    if (parsed.rolling_daily === true) {
      result.rollingDaily = true;
      return result;
    }

    const w = parsed.rolling_weekly_weekday;
    if (typeof w === "number" && w >= 0 && w <= 6) {
      result.rollingWeekly = { weekday: w as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
      if (dateIso) result.dateIso = dateIso;
      if (dateIso2) result.dateIso2 = dateIso2;
      if (time) result.time = time;
      return result;
    }

    if (dateIso) result.dateIso = dateIso;
    if (time) result.time = time;
    if (dateIso2) result.dateIso2 = dateIso2;
    return result;
  } catch (e) {
    console.warn("[extractAuctionDateWithAI]", e);
    return null;
  }
}
