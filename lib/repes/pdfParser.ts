import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Parser GPT pentru PDF-uri REPES (anunțuri executări publice / licitații)
 * Extrage: titlu comercial (căutare), descriere segmentată fără nume, câmpuri pentru Informații despre licitație.
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface RepesPDFExtraction {
  /** Descriere segmentată (HTML): doar informații relevante, FĂRĂ nume persoane, FĂRĂ transfer bancar */
  description_html: string | null;
  /** Titlu comercial, optimizat pentru căutare: ex. "Apartament 3 camere, Ulmeni, Maramureș" sau "Autoturism Dacia Duster, 120.000 km, 1.5 dCi" */
  title: string | null;
  location_raw: string | null;
  location_city: string | null;
  location_county: string | null;
  price_text: string | null;
  auction_date: string | null;
  auction_time: string | null;
  /** Licitator, Email, Telefon, Adresă, Fax, Cod fiscal, Competență + Camere, Etaj, Suprafață, Tip imobil (imobiliare) + Marca, Model, Kilometraj, Capacitate cilindrică, Combustibil, An fabricație (auto) */
  meta_fields: Record<string, string> | null;
}

const systemPrompt = `Ești un expert în analiza documentelor românești pentru executări silite și licitații publice (REPES).
Extragi informații structurate pentru anunțuri comerciale. TITLUL și DESCRIEREA trebuie respectate STRICT conform modelelor de mai jos – fără excepții. Acest format face posibilă și clasificarea automată în categorii și subcategorii.

---

TITLU (title) – REGULI STRICTE, OBLIGATORII

Fiecare tip de bun are un șablon pe care TREBUIE să îl respecți. Nu folosi formulări vagi (ex. "Imobil", "Bun" fără detaliu). Fără nume de persoane, fără "debitor"/"proprietar [nume]".

1) TEREN (fără construcție):
   Format obligatoriu: "Teren [intravilan sau extravilan], [suprafață în mp sau ha], [Localitate], [Județ]"
   Exemple: "Teren intravilan, 500 mp, Ulmeni, Maramureș" / "Teren extravilan, 2 ha, Vicea, Maramureș"
   – Trebuie cuvântul "teren", trebuie intravilan sau extravilan, trebuie suprafața, trebuie localitatea.

2) TEREN CU CONSTRUCȚIE / TEREN CU IMOBIL:
   Format obligatoriu: "Teren [intravilan/extravilan] cu construcție, [suprafață teren], [suprafață construită dacă e cunoscută], [Localitate], [Județ]"
   Sau: "Teren [intravilan/extravilan] cu imobil, [X] mp teren, [Localitate], [Județ]"
   – Specifică clar că este teren cu construcție/imobil, suprafața și localitatea.

3) APARTAMENT:
   Format obligatoriu: "Apartament [X] camere[, Y mp dacă există], [Localitate], [Județ]"
   Exemple: "Apartament 3 camere, 75 mp, Ulmeni, Maramureș" / "Apartament 2 camere, Cluj-Napoca, Cluj"
   – Trebuie cuvântul "apartament" și obligatoriu numărul de camere. Suprafața (mp) dacă apare în document.

4) CASĂ / VILĂ:
   Format obligatoriu: "Casă [X] camere[, Y mp][, cu teren Z mp dacă are teren], [Localitate], [Județ]"
   Sau: "Vilă [X] camere, [Y mp], [cu teren Z mp], [Localitate], [Județ]"
   – Specifică câte camere are, metri pătrați ai construcției, dacă are teren – câți mp de teren. Apoi localitatea și județul.

5) AUTOTURISM / MAȘINĂ:
   Format obligatoriu: "Autoturism [Marca] [Model][, an][, km km][, motor/combustibil]"
   Exemple: "Autoturism Dacia Duster, 2018, 120.000 km, 1.5 dCi" / "Autoturism BMW Seria 3, 2020, 80.000 km"
   – Obligatoriu marca și modelul. An, kilometraj, motor/combustibil când sunt în document.

6) SPAȚIU COMERCIAL / BIROURI / HALĂ:
   Format: "[Tip: Spațiu comercial / Birouri / Hală], [suprafață] mp, [Localitate], [Județ]"

7) UTILAJE / ECHIPAMENTE:
   Format: "[Denumire precisă utilaj/echipament], [caracteristici esențiale], [Localitate]"

8) ALTE BUNURI:
   Denumire precisă + caracteristici esențiale + locație. Evită "Imobil" sau "Bun" fără detaliu.

---

DESCRIERE (description_html) – LA FEL DE STRICTĂ

- Format HTML: secțiuni clare cu <h3> sau <p><strong>...</strong></p>, paragrafe <p>, liste <ul>/<li>.
- Secțiuni obligatorii (unde se aplică): "Obiectul licitației" (ce este de vânzare – tip bun, camere, mp, intravilan/extravilan, marca/model etc.), "Locație și cadastru" (localitate, județ, adresă, nr. cadastral), "Preț și condiții" (preț licitație, procent evaluare, liber de sarcini).
- Pentru TEREN: explică obligatoriu dacă e intravilan sau extravilan, suprafața în mp/ha, localitatea. Dacă e teren cu construcție, specifică și suprafața construită.
- Pentru APARTAMENT: explică câte camere, suprafață (mp), etaj, localitate.
- Pentru CASĂ/VILĂ: explică câte camere, mp construcție, dacă are teren – câți mp teren, localitate.
- Pentru AUTOTURISM: explică marca, modelul, an, kilometraj, motor/combustibil.
- INCLUDE: nr. cadastral/topografic, preț licitație, "vânzare liber de sarcini", "înscris în CF" (fără nume persoane).
- EXCLUDE TOTAL: nume persoane, transfer bancar, IBAN, cont bancar, date personale. Înlocuiește nume cu "[omis]".
- Nu inventa: doar date din text. Păstrează termeni juridici relevanți (carte funciară, cadastru).

---

CÂMPURI PENTRU "INFORMAȚII DESPRE LICITAȚIE" (meta_fields) – chei exacte în română:
- Contact executor: Licitator, Email, Telefon, Fax, Adresă, Cod fiscal, Competență (valorile din document, fără nume persoane în Licitator dacă e doar nume de persoană; poți păstra denumire instanță/organ).
- IMOBILIARE: Camere (nr. camere), Etaj (ex. P+1, 2), Suprafață (ex. 107 mp, 252,80 mp), Tip imobil (Apartament / Casă / Teren / Imobil). Pentru TEREN obligatoriu: Suprafață (ex. 500 mp, 2 ha), Categorie teren (Intravilan / Extravilan), Localitate și Județ (sau Locație) – acestea intră și în titlu.
- AUTOTURISME: Marca, Model, Kilometraj (ex. 120.000 km), Capacitate cilindrică (ex. 1500 cmc), Combustibil, An fabricație.
- Comune: location_raw, location_city, location_county, price_text le tratezi în câmpurile de top-level; în meta_fields poți adăuga orice altă etichetă relevantă din document (ex. Nr. cadastral, Suprafață teren) cu chei în română.

---

REGLI TEHNICE:
- Returnează DOAR JSON valid, fără text înainte sau după.
- description_html: string HTML; dacă nu există text descriptiv util, null.
- title: string non-gol; obligatoriu conform regulilor de mai sus.
- meta_fields: obiect cheie-valoare; chei în română (Camere, Etaj, Suprafață, Tip imobil, Marca, Model, Kilometraj, Capacitate cilindrică, Combustibil, An fabricație, Licitator, Email, Telefon, Adresă, Fax, Cod fiscal, Competență). Valorile string, fără HTML, fără nume persoane.
- location_raw, location_city, location_county, price_text, auction_date, auction_time: string sau null.
- DATA (auction_date): În documentele românești data este ÎNTOTDEUNA zi.lună.an (DD.MM.YYYY). Exemple: 10.03.2026 = 10 martie 2026, 03.10.2026 = 3 octombrie 2026. Când returnezi auction_date în JSON, folosește format ISO YYYY-MM-DD și interpretează CORECT zi-lună-an: 10.03.2026 → "2026-03-10", 03.10.2026 → "2026-10-03". NU inversa ziua cu luna (nu interpreta 10.03 ca 3 octombrie).
- Nu inventa: doar date extrase din text.`;

const userPrompt = (pdfText: string) => `Extrage din următorul text PDF (executare silită / licitație publică) toate câmpurile pentru anunț.

Reguli STRICTE:
1. title: respectă OBLIGATORIU șabloanele din sistem:
   - Teren: "Teren intravilan/extravilan, [mp/ha], [Localitate], [Județ]" sau "Teren intravilan/extravilan cu construcție, ..."
   - Apartament: "Apartament [X] camere[, mp], [Localitate], [Județ]"
   - Casă/Vilă: "Casă/Vilă [X] camere[, mp][, cu teren Z mp], [Localitate], [Județ]"
   - Autoturism: "Autoturism [Marca] [Model][, an, km, motor]"
   Fără termeni vagi ("Imobil", "Bun" fără detaliu). Fără nume persoane.
2. description_html: descriere în HTML cu secțiuni clare; pentru teren explică intravilan/extravilan + suprafață + localitate; pentru apartament camere + mp + localitate; pentru casă/vilă camere + mp + teren (dacă are) + localitate; pentru mașină marca, model, an, km. FĂRĂ nume persoane, FĂRĂ transfer bancar/IBAN. Păstrează nr. cadastral, preț, "liber de sarcini".
3. meta_fields: Licitator, Email, Telefon, Adresă, Cod fiscal, Competență; imobiliare: Camere, Etaj, Suprafață, Tip imobil; auto: Marca, Model, Kilometraj, Combustibil, An fabricație (chei în română).
4. location_raw, location_city, location_county, price_text, auction_date (ISO YYYY-MM-DD; în document zi.lună.an – 10.03.2026 = 10 martie → 2026-03-10), auction_time.

---
${pdfText.slice(0, 120000)}
---

Returnează JSON: description_html, title, location_raw, location_city, location_county, price_text, auction_date, auction_time, meta_fields.`;

export async function parseRepesPDFWithGPT(pdfText: string): Promise<RepesPDFExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt(pdfText) },
    ],
    temperature: 0.2,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error("Empty response from GPT");
  }

  let parsed: RepesPDFExtraction;
  try {
    parsed = JSON.parse(responseText) as RepesPDFExtraction;
  } catch {
    throw new Error(`Invalid JSON response from GPT: ${responseText.slice(0, 200)}`);
  }

  if (!parsed.meta_fields || typeof parsed.meta_fields !== "object") {
    parsed.meta_fields = null;
  } else {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.meta_fields)) {
      if (k != null && typeof v === "string" && v.trim()) {
        cleaned[String(k).trim()] = String(v).trim();
      }
    }
    parsed.meta_fields = Object.keys(cleaned).length ? cleaned : null;
  }

  return {
    description_html: typeof parsed.description_html === "string" && parsed.description_html.trim() ? parsed.description_html.trim() : null,
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
    location_raw: typeof parsed.location_raw === "string" && parsed.location_raw.trim() ? parsed.location_raw.trim() : null,
    location_city: typeof parsed.location_city === "string" && parsed.location_city.trim() ? parsed.location_city.trim() : null,
    location_county: typeof parsed.location_county === "string" && parsed.location_county.trim() ? parsed.location_county.trim() : null,
    price_text: typeof parsed.price_text === "string" && parsed.price_text.trim() ? parsed.price_text.trim() : null,
    auction_date: typeof parsed.auction_date === "string" && parsed.auction_date.trim() ? parsed.auction_date.trim() : null,
    auction_time: typeof parsed.auction_time === "string" && parsed.auction_time.trim() ? parsed.auction_time.trim() : null,
    meta_fields: parsed.meta_fields,
  };
}
