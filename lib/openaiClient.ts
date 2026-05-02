import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import OpenAI from 'openai';
import { formatPrice } from './currency';
import { ProductForEvaluation, PriceLevel, AIExplanation } from './types/priceEvaluation';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * Generează explicație AI pentru evaluarea prețului
 */
export async function generatePriceExplanation(
  product: ProductForEvaluation,
  level: PriceLevel,
  stats: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    samplesCount: number;
  },
  categoryContext: string
): Promise<AIExplanation> {
  // Dacă nu avem API key, returnăm explicație fallback
  if (!process.env.OPENAI_API_KEY) {
    return getFallbackExplanation(product, level, stats);
  }

  try {
    const levelLabels: Record<PriceLevel, string> = {
      very_good: "Preț foarte avantajos",
      good: "Preț convenabil",
      fair: "Preț potrivit",
      high: "Preț în creștere",
      very_high: "Peste nivelul pieței",
    };

    const levelLabel = levelLabels[level];
    const priceFormatted = formatPrice(product.price, product.currency);
    const avgPriceFormatted = formatPrice(stats.avgPrice, product.currency);

    // Detectează tipul real al produsului pentru a evita comparații greșite
    const titleLower = (product.title || '').toLowerCase();
    const descriptionLower = (product.description || '').toLowerCase();
    const isLiveBid = product.attributes?.productType === 'live-bid';
    let realProductType = '';
    let specialContext = '';
    
    // Detectare tip real pentru imobiliare
    if (product.category === 'apartment' || product.category === 'house' || product.category === 'imobiliare') {
      if (titleLower.includes('anexă') || titleLower.includes('anexa') || titleLower.includes('magazie') || 
          descriptionLower.includes('anexă') || descriptionLower.includes('anexa')) {
        realProductType = 'ANEXĂ / CONSTRUCȚIE SECUNDARĂ';
        specialContext = '⚠️ ATENȚIE: Aceasta este o anexă sau construcție secundară, NU o casă normală. Nu compara cu vile sau case finalizate. Compară doar cu anexe, magazii sau construcții secundare similare.';
      } else if (titleLower.includes('nefinalizat') || titleLower.includes('nefinalizată') || 
                 descriptionLower.includes('nefinalizat') || descriptionLower.includes('nefinalizată') || 
                 titleLower.includes('în construcție') || descriptionLower.includes('în construcție')) {
        realProductType = 'CASĂ NEFINALIZATĂ / ÎN CONSTRUCȚIE';
        specialContext = '⚠️ ATENȚIE: Aceasta este o casă nefinalizată sau în construcție, NU o casă finalizată. Nu compara cu case finalizate sau vile. Compară doar cu case nefinalizate, construcții în curs sau gospodării vechi similare. Prețurile pentru case nefinalizate sunt de obicei 30-60% din valoarea unei case finalizate.';
      } else if (titleLower.includes('rural') || titleLower.includes('sat') || 
                 descriptionLower.includes('rural') || descriptionLower.includes('sat') ||
                 (product.city && !['bucuresti', 'cluj', 'timisoara', 'iasi', 'constanta', 'brasov'].includes(product.city.toLowerCase()))) {
        realProductType = 'PROPRIETATE RURALĂ';
        specialContext = '⚠️ ATENȚIE: Aceasta este o proprietate rurală, NU urbană. Nu compara cu proprietăți din orașe mari. Compară doar cu proprietăți rurale similare din aceeași zonă.';
      }
    }
    
    // Detectare licitație - DOAR dacă NU este Live Bid
    // Pentru Live Bid, nu menționăm "licitații publice" în evaluare
    if (!isLiveBid && (titleLower.includes('licitație') || titleLower.includes('licitatie') || 
        descriptionLower.includes('licitație') || descriptionLower.includes('licitatie'))) {
      specialContext += '\n⚠️ LICITAȚIE PUBLICĂ: Prețurile pentru licitații sunt de obicei 30-60% din valoarea de piață normală. Ajustează evaluarea în consecință.';
    }
    
    // Detectare bun confiscat / executare
    if (titleLower.includes('confiscat') || titleLower.includes('executare') || 
        titleLower.includes('anabi') || descriptionLower.includes('confiscat') || 
        descriptionLower.includes('executare')) {
      specialContext += '\n⚠️ BUN CONFISCAT/EXECUTARE: Prețurile pentru bunuri confiscate sunt de obicei 30-70% din valoarea de piață normală. Ajustează evaluarea în consecință.';
    }

    const prompt = `Analizează următoarea situație de evaluare a prețului:

${realProductType ? `TIP REAL PRODUS: ${realProductType}\n` : ''}${specialContext ? `${specialContext}\n` : ''}
Produs: ${product.title}
${product.description ? `Descriere: ${product.description.substring(0, 300)}\n` : ''}
Preț cerut: ${priceFormatted}
Categorie: ${product.category}
${categoryContext}

Statistici piață (din comparabile similare):
- Preț minim: ${stats.minPrice.toLocaleString('ro-RO')} ${product.currency}
- Preț maxim: ${stats.maxPrice.toLocaleString('ro-RO')} ${product.currency}
- Preț mediu: ${avgPriceFormatted}
- Oferte analizate: ${stats.samplesCount}

Nivel evaluat: ${levelLabel}

🔥 INSTRUCȚIUNI CRITICE:

1. Identifică mai întâi TIPUL REAL al produsului (nu doar categoria). Dacă este anexă, casă nefinalizată, proprietate rurală, bun confiscat sau licitație → ajustează evaluarea corespunzător.

2. Compară DOAR cu produse SIMILARE (aceeași categorie, tip real, stare, caracteristici, vechime, zonă).

3. Dacă comparabilele sunt prea diferite sau prea puține → spune explicit și ajustează responsabil.

4. Pentru imobiliare: verifică dacă este urban/rural, nou/vechi, finalizat/nefinalizat, anexă sau casă normală.

5. Pentru licitații/bunuri confiscate: aplică reducerile corespunzătoare (30-70% din piață normală).

6. IMPORTANT: Dacă produsul este de tip "Live Bid" (licitație live), NU menționa "licitații publice" sau "licitație publică" în explicație. Folosește doar termeni precum "produs", "ofertă", "tranzacție" sau "vânzare". Live Bid este o licitație live, nu o licitație publică tradițională.

7. Fii REALIST - nu inventezi prețuri mari dacă nu există comparabile similare.

Generează o explicație detaliată în limba română care să includă:
1. Un rezumat scurt (2-3 propoziții) care să explice nivelul prețului ȘI tipul real al produsului
2. O descriere lungă (4-6 propoziții) care să explice de ce prețul este evaluat astfel, menționând tipul real al produsului și comparabilele folosite
3. 3-5 bullet points cu recomandări concrete și ce ar trebui verificat

${isLiveBid ? '⚠️ IMPORTANT: Acest produs este de tip "Live Bid" (licitație live). NU menționa "licitații publice", "licitație publică" sau "licitațiilor publice" în explicație. Folosește doar termeni precum "produs", "ofertă", "tranzacție", "vânzare" sau "licitație live".' : ''}

Răspunde în format JSON:
{
  "summary": "rezumat scurt care menționează tipul real al produsului",
  "details": {
    "ro_short": "versiune scurtă (1 propoziție)",
    "ro_long": "descriere lungă detaliată care explică tipul real, comparabilele folosite și de ce prețul este evaluat astfel",
    "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
  }
}`;

    const systemPrompt = `Tu ești AI Price Evaluator, un motor profesional de evaluare a prețurilor pentru marketplace.

Trebuie să oferi evaluări realiste, nu valori exagerate.

Analizezi produsul exact, ții cont de categoria lui și cauți comparabile reale în piață.

Nu compari niciodată produse diferite cu valori mult mai mari.

🔥 REGULI FUNDAMENTALE:

1. ÎNVAȚĂ PRIMA REGULĂ - Identifici mai întâi tipul real al produsului, NU doar categoria generală:
   - "Anexă + casă nefinalizată" ≠ "Casă normală"
   - "Telefon vechi" ≠ "iPhone 15"
   - "Tractor vechi fără acte" ≠ "Tractor John Deere 2020"
   - "Cărți poștale istorice" ≠ "Artă digitală modernă"
   Dacă tipul real este diferit de categoria mare → schimbi automat logica de evaluare.

2. REGULA COMPARABILELOR REALISTE - Compari produsul doar cu produse SIMILARE:
   - aceeași categorie
   - același tip real
   - aceeași stare
   - aceleași caracteristici tehnice
   - aceeași vechime
   - aceeași zonă (la imobiliare)
   - aceeași valoare generală

3. Dacă găsești PREA PUȚINE comparabile → NU INVENTEZI PREȚURI MARI:
   Spui: "Există puține comparabile reale. Evaluarea este făcută pe baza celor mai apropiate proprietăți similare disponibile." Și ajustezi responsabil.

4. REGULI SPECIALE PENTRU CATEGORII:

   AUTO: compari aceeași marcă, model, an, motorizare, km. Ajustezi pentru starea mașinii. Eviti compararea unui Golf 1.4 2009 cu Golf GTI 2016.

   IMOBILIARE: Înainte de evaluare, trebuie să decizi:
   - Proprietate urbană / rurală
   - Casă nouă / casă veche / casă nefinalizată
   - Anexă / magazie / construcție secundară
   - Bloc vechi / nou / confort 1 / confort 2
   - Teren intravilan / extravilan / agricol
   
   Dacă este LICITAȚIE PUBLICĂ (NU Live Bid): valoare_piață × 0.30 – 0.60 = valoare de licitație realistă
   
   Dacă este ANEXĂ sau CASĂ NEFINALIZATĂ: NU o compari cu vile de 200k–500k €, ci cu:
   - anexe
   - case nefinalizate
   - gospodării vechi
   - proprietăți rurale
   - imobile sub 50.000 €

   UTILAJE: compari doar utilaje cu același tonaj, putere, an. Ajustare mare pentru ore de funcționare. Eviti compararea unui excavator de 3 tone cu unul de 15 tone.

   MODĂ, HAINE, ACCESORII: brand, colecție, stare (nou / second hand), autenticitate, raritate.

   ELECTRONICE: model, generație, memorie, configurare identică.

   ARTĂ, ANTICHITĂȚI, COLECȚII: autenticitate, raritate, proveniență, stare, certificări.

   NFT / Artă digitală: colecție, blockchain, floor price, raritate.

5. INTERVAL DE PREȚ – model mobil.de, dar realist:
   După ce găsești comparabile corecte, calculezi: Preț minim, Preț mediu, Preț maxim.
   Apoi generezi: Preț foarte avantajos, Preț convenabil, Preț corect (median ± 10%), Preț în creștere, Peste nivelul pieței.
   Dar DOAR dacă datele suportă asta — nu dacă comparabilele sunt nesimilarizate.

6. DACĂ EVALUAREA PARE GREȘITĂ → TREBUIE SĂ TE AUTOCORIGEZI:
   Dacă comparațiile sunt complet diferite ca valoare, spui:
   "Comparabilele disponibile în piață au valori foarte diferite față de tipul real al produsului. Ajustez evaluarea pe baza caracteristicilor specifice și contextului real."
   Și reduci / crești realist.

7. TEXTUL FINAL TREBUIE SĂ FIE PROFESIONIST:
   Include: evaluare clară, intervalele realiste, ce factori au influențat prețul, ce ar trebui verificat, limitările datelor.

Scrii explicații clare, obiective și utile pentru utilizatori, în limba română.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '';
    
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText);
        return {
          summary: parsed.summary || getFallbackExplanation(product, level, stats).summary,
          details: {
            ro_short: parsed.details?.ro_short || levelLabel,
            ro_long: parsed.details?.ro_long || getFallbackExplanation(product, level, stats).details.ro_long,
            bullets: Array.isArray(parsed.details?.bullets) ? parsed.details.bullets : getFallbackExplanation(product, level, stats).details.bullets,
          },
        };
      } catch (parseError) {
        console.error('[OpenAI] Error parsing JSON response:', parseError);
        return getFallbackExplanation(product, level, stats);
      }
    }

    return getFallbackExplanation(product, level, stats);
  } catch (error) {
    console.error('[OpenAI] Error generating price explanation:', error);
    return getFallbackExplanation(product, level, stats);
  }
}

/**
 * Generează explicație fallback când OpenAI nu este disponibil
 */
function getFallbackExplanation(
  product: ProductForEvaluation,
  level: PriceLevel,
  stats: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    samplesCount: number;
  }
): AIExplanation {
  const levelDescriptions: Record<PriceLevel, { summary: string; long: string; bullets: string[] }> = {
    very_good: {
      summary: "Prețul se situează semnificativ sub media pieței pentru produse similare.",
      long: "Prețul se situează semnificativ sub media pieței pentru produse similare. Recomandăm verificarea detaliată a caracteristicilor produsului, stării tehnice și a condițiilor de vânzare pentru a identifica eventuale limitări sau particularități care justifică acest nivel de preț.",
      bullets: [
        "Verifică starea produsului și eventuale defecte",
        "Citește cu atenție toate condițiile de vânzare",
        "Compară cu alte oferte similare pentru a identifica diferențele",
      ],
    },
    good: {
      summary: "Prețul se situează sub media pieței pentru produse comparabile.",
      long: "Prețul se situează sub media pieței pentru produse comparabile, indicând o oportunitate favorabilă de achiziție în contextul condițiilor de piață actuale.",
      bullets: [
        "O oportunitate bună de achiziție",
        "Prețul este competitiv față de piață",
        "Verifică disponibilitatea și condițiile de tranzacție",
      ],
    },
    fair: {
      summary: "Prețul este aliniat cu media pieței pentru produse similare.",
      long: "Prețul este aliniat cu media pieței pentru produse similare, reflectând o evaluare corectă a valorii produsului în raport cu ofertele comparabile disponibile.",
      bullets: [
        "Prețul este potrivit pentru piață",
        "Oferta este competitivă",
        "Valoarea este corect evaluată",
      ],
    },
    high: {
      summary: "Prețul depășește ușor media pieței pentru produse comparabile.",
      long: "Prețul depășește ușor media pieței pentru produse comparabile. Diferența poate fi justificată de factori precum localizare, caracteristici specifice sau condiții particulare de tranzacție.",
      bullets: [
        "Verifică dacă există caracteristici speciale care justifică prețul",
        "Compară cu oferte similare pentru a identifica diferențele",
        "Negociază dacă este posibil",
      ],
    },
    very_high: {
      summary: "Prețul depășește semnificativ media pieței pentru produse similare.",
      long: "Prețul depășește semnificativ media pieței pentru produse similare. Această diferență poate fi justificată de factori obiectivi precum localizare strategică, caracteristici distinctive, potențial de valorificare sau condiții specifice ale tranzacției care pot include beneficii suplimentare sau restricții de utilizare.",
      bullets: [
        "Verifică dacă există factori obiectivi care justifică diferența",
        "Analizează caracteristicile distinctive ale produsului",
        "Consideră potențialul de valorificare pe termen lung",
      ],
    },
  };

  const description = levelDescriptions[level];

  return {
    summary: description.summary,
    details: {
      ro_short: levelDescriptions[level].summary,
      ro_long: description.long,
      bullets: description.bullets,
    },
  };
}

