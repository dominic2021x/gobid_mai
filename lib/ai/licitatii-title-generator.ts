/**
 * Generează titlu pentru anunț licitație din descriere, optimizat pentru căutare (sugestii search).
 * Input: text descriere (+ opțional titlu sursă, categorie, județ). Output: titlu scurt, cuvinte cheie.
 */

import { getOpenAIClient } from './openai';

const MAX_TITLE_LENGTH = 78;

export interface GenerateTitleInput {
  /** Text extras din description_html (fără HTML) */
  descriptionText: string;
  /** Titlul original din sursă (opțional) */
  sourceTitle?: string | null;
  /** Categoria din sursă (opțional, pentru context) */
  category?: string | null;
  /** Județ (opțional, pentru locație în titlu) */
  county?: string | null;
  /** Oraș (opțional) */
  city?: string | null;
}

/**
 * Generează un titlu scurt, potrivit pentru căutare, din descrierea anunțului.
 * Returnează null dacă OpenAI nu e configurat sau eșuează (caller-ul poate folosi fallback).
 */
export async function generateLicitatiiTitleFromDescription(input: GenerateTitleInput): Promise<string | null> {
  const { descriptionText, sourceTitle, category, county, city } = input;
  const text = (descriptionText || '').trim();
  if (!text) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const openai = getOpenAIClient();
    const context: string[] = [];
    if (sourceTitle) context.push(`Titlu sursă: ${sourceTitle}`);
    if (category) context.push(`Categorie: ${category}`);
    if (county) context.push(`Județ: ${county}`);
    if (city) context.push(`Oraș: ${city}`);

    const locationInstruction = county
      ? `\nIMPORTANT locație în titlu: Include întotdeauna județul din Context (Județ: ${county}).${city ? ` Include și orașul când e disponibil (Oraș: ${city}).` : ''} Folosește EXACT aceste locații, nu inventa altele (ex: nu pune Craiova dacă în context este București).`
      : city
        ? `\nIMPORTANT: Include în titlu orașul din Context (Oraș: ${city}). Nu inventa alte locații.`
        : '';

    const userContent = `Descriere anunț licitație:
${text.slice(0, 2500)}
${context.length ? '\nContext: ' + context.join(' | ') : ''}
${locationInstruction}

Cerință: Generează un singur titlu în limba română, scurt (max ${MAX_TITLE_LENGTH} caractere). Titlul trebuie să conțină: tipul bunului; județul (și orașul dacă e în Context); 1-2 caracteristici esențiale. Formulare clară, cuvinte cheie pentru căutare. Fără ghilimele. Doar titlul.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în redactarea titlurilor pentru anunțuri de licitații. Generezi titluri scurte, clare, cu cuvinte cheie pentru căutare. Răspunde doar cu titlul, fără explicații sau ghilimele.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 120,
      temperature: 0.4,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const title = raw.replace(/^["']|["']$/g, '').trim();
    return title.length > MAX_TITLE_LENGTH ? title.slice(0, MAX_TITLE_LENGTH - 1).trim() : title;
  } catch (error) {
    console.warn('[licitatii-title-generator] OpenAI failed:', error);
    return null;
  }
}

/**
 * Fallback când AI nu e disponibil: titlu din sursă sau din primele cuvinte ale descrierii.
 */
export function fallbackTitle(sourceTitle: string | null, descriptionText: string): string {
  const fromSource = (sourceTitle || '').trim();
  if (fromSource.length >= 10 && fromSource.length <= MAX_TITLE_LENGTH) return fromSource;
  const fromDesc = (descriptionText || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);
  if (fromDesc.length >= 10) return fromDesc.trim();
  return fromSource.slice(0, MAX_TITLE_LENGTH) || fromDesc || 'Anunț licitație';
}

/**
 * Parafrazare descriere pentru licitații: același conținut în totalitate, doar reformulat.
 * Listele de bunuri (nr, denumire, valoare/preț) rămân unul sub altul, nu se transformă în propoziții.
 * La eșec returnează textul original.
 */
export async function paraphraseLicitatiiDescription(
  descriptionText: string,
  _titleForContext: string
): Promise<string> {
  const text = (descriptionText || '').trim();
  if (!text) return '';
  if (!process.env.OPENAI_API_KEY) return text;

  try {
    const openai = getOpenAIClient();
    const userContent = `Rescrie următoarea descriere de licitație. Reguli stricte:

1. PĂSTREAZĂ TOATĂ INFORMAȚIA: adrese, nume, CUI, date, ore, sume, condiții — tot.

2. LISTE DE BUNURI (foarte important): Multe anunțuri conțin mai multe produse cu valori (ex: "1 Instalație recuperare 1.014,3", "2 Bucătărie 608,4", "NR. IDENTIFICARE Valoare la 90%", "TOTAL 7.927,2 lei"). Acestea NU trebuie transformate în propoziții. Păstrează-le ca LISTĂ, un element pe fiecare rând, clar și lizibil. Formatează fiecare rând astfel: denumirea produsului și prețul/valoarea pe același rând (ex: "1. Instalație recuperare – 1.014,3 lei" sau "Instalație recuperare – preț 1.014,3 lei"). Nu unifica mai multe produse într-o singură propoziție (greșit: "Licitația cuprinde instalație recuperare, bucătărie, telefon..."). Corect: fiecare bun pe rândul lui, cu prețul lui.

3. Restul textului (intro despre lichidator, date licitație, loc, condiții de participare, garanții etc.) poate fi reformulat în alte cuvinte, dar fără a omite nimic.

4. Limba: română. Răspunde DOAR cu textul descrierii, fără introduceri.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Ești redactor pentru descrieri de licitații. Păstrezi toate detaliile. Când descrierea conține mai multe bunuri cu prețuri (liste, tabele), le lași unul sub altul, fiecare pe rândul lui cu denumirea și prețul/valoarea, nu le transformi în propoziții. Exemple: "1. Instalație recuperare – 1.014,3 lei" pe un rând, "2. Bucătărie – 608,4 lei" pe rândul următor.',
        },
        { role: 'user', content: `${userContent}\n\n---\n\n${text.slice(0, 12000)}` },
      ],
      max_tokens: 4000,
      temperature: 0.35,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return text;
    return raw;
  } catch (error) {
    console.warn('[licitatii] paraphrase description failed, using original:', error);
    return text;
  }
}

/**
 * Extrage din descriere locația exactă unde sunt bunurile / unde se desfășoară licitația.
 * Ex: "Craiova, strada Știrbei Vodă, nr. 30, județul Dolj", "punctul de lucru situat în...".
 * Returnează null dacă nu găsește sau API e indisponibil.
 */
export async function extractLicitatiiLocationFromDescription(descriptionText: string): Promise<string | null> {
  const text = (descriptionText || '').trim();
  if (!text || text.length < 50) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const openai = getOpenAIClient();
    const userContent = `Din următoarea descriere de licitație extrage DOAR locația exactă unde sunt bunurile sau unde se desfășoară licitația (adresa punctului de lucru, locul unde se face vânzarea). Exemple de formulări în text: "Licitația se va desfășura la punctul de lucru situat în Craiova, strada Știrbei Vodă, nr. 30, județul Dolj", "la sediul..., str. X, nr. Y", "la adresa...". Răspunde cu o singură propoziție sau adresă scurtă, fără introduceri. Dacă nu există o locație concretă în text, răspunde cu exact: NU`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Extragi din texte juridice/administrative doar locația exactă (oraș, stradă, număr, județ) unde sunt bunurile sau unde se desfășoară licitația. Răspuns scurt, fără explicații. Dacă nu e menționată o astfel de locație, răspunde NU.',
        },
        { role: 'user', content: `${userContent}\n\n---\n\n${text.slice(0, 6000)}` },
      ],
      max_tokens: 200,
      temperature: 0.2,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw || /^\s*NU\s*$/i.test(raw)) return null;
    return raw.length > 5 ? raw : null;
  } catch (error) {
    console.warn('[licitatii] extract location failed:', error);
    return null;
  }
}
