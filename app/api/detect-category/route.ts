import { NextRequest, NextResponse } from 'next/server';
import descriptionTemplates from '@/app/(site)/dashboard/my-products/description-templates.json';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || text.trim().length < 3) {
      return NextResponse.json({ error: 'Text too short' }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Construiește lista de categorii și subcategorii pentru prompt
    const categoriesList: string[] = [];
    for (const [category, subcategories] of Object.entries(descriptionTemplates as Record<string, Record<string, unknown>>)) {
      for (const subcategory of Object.keys(subcategories)) {
        categoriesList.push(`${category} > ${subcategory}`);
      }
    }

    const prompt = `Analizează următorul text de anunț și determină categoria și subcategoria corectă din lista de mai jos.

Text: "${text}"

Categorii disponibile:
${categoriesList.map((c, i) => `${i + 1}. ${c}`).join('\n')}

REGULI CRITICE DE CLASIFICARE (VERIFICĂ ÎN ACEASTĂ ORDINE):

1. PIESE AUTO ȘI ACCESORII (PRIORITATE ABSOLUTĂ - VERIFICĂ PRIMUL):
   Dacă textul conține ORICARE dintre următoarele cuvinte cheie, alege OBLIGATORIU "Autovehicule > Piese Auto și Accesorii":
   - "aripă", "aripa", "aripă", "aripă dreaptă", "aripă stângă", "aripă față", "aripă spate", "aripă de", "aripa de"
   
   IMPORTANT: Chiar dacă textul conține și un model de mașină (ex: "X5", "A4", "E46") și un an (ex: "2011", "2015"), 
   dacă menționează o PIESĂ (aripă, capotă, far, etc.), este OBLIGATORIU "Piese Auto și Accesorii", NU "Autoturisme".
   
   EXEMPLE CLARE:
   - "Vând aripă de BMW X5 2011" → PIESE AUTO (are "aripă")
   - "aripă BMW X5" → PIESE AUTO (are "aripă")
   - "aripă X5 2011" → PIESE AUTO (are "aripă")
   - "capotă Audi A4" → PIESE AUTO (are "capotă")
   - "faruri Mercedes" → PIESE AUTO (are "faruri")
   
   NU confunda: Dacă textul spune "Vând mașină BMW X5 2011" → AUTOTURISME (are "mașină")
   - "capotă", "capota", "capotă"
   - "far", "faruri", "far stâng", "far drept", "far față", "far spate"
   - "parbriz", "parbrizul", "geam", "geamuri", "geam față", "geam spate"
   - "oglindă", "oglinda", "oglindă retrovizoare", "oglindă laterală"
   - "bară", "bara", "bară față", "bară spate", "bară laterală", "bumper", "bumperul"
   - "spoiler", "spoilerul", "grilă", "grilă"
   - "cutie de viteze", "cutie viteze", "cutie", "transmisie"
   - "motor", "motorul", "bloc motor", "cap motor"
   - "suspensie", "suspensiile", "amortizor", "amortizoare"
   - "frana", "frâna", "frane", "frâne", "disc frână", "plăcuțe frână"
   - "roți", "roți", "jante", "jantele", "anvelope", "cauciucuri", "pneuri"
   - "volan", "volanul", "scaun", "scaune", "scaun șofer", "scaun pasager"
   - "uși", "uși", "portiere", "portieră", "portiera"
   - "huse", "husă", "husa", "tapiterie", "tapiteria"
   - "piese", "piese auto", "piese bmw", "piese audi", "piese mercedes"
   - "accesorii auto", "accesorii mașină"
   - "filtru", "filtru ulei", "filtru aer", "filtru combustibil"
   - "baterie auto", "baterie mașină"
   - "radiator", "radiatorul"
   - "alternator", "alternatorul"
   - "starter", "starterul"
   - "senzori", "senzor", "senzor parcare", "senzor ploaie"
   - "camera", "camera parcare", "camera față", "camera spate"
   - "navigație", "navigație auto", "GPS auto"
   - "radio", "radio auto", "sistem audio"
   - "led", "leduri", "xenon", "halogen"
   
   EXEMPLE: "vand aripa bmw", "aripă x5 bmw", "vand faruri audi", "cutie viteze mercedes", "jante bmw", "anvelope", "piese bmw x5"

2. AUTOTURISME (MAȘINI ÎNTREGI):
   Alege "Autovehicule > Autoturisme" DOAR dacă:
   - Textul menționează explicit "mașină", "masina", "autoturism", "vehicul", "automobil", "mașină întreagă"
   - Textul menționează caracteristici ale unei mașini întregi: "an fabricație", "kilometraj", "combustibil", "cutie de viteze" (în context de mașină întreagă)
   - Textul NU conține cuvinte cheie de piese auto (verifică mai întâi regula 1)
   - Textul NU începe cu sau nu conține o piesă specifică (aripă, capotă, far, etc.)
   
   EXEMPLE CORECTE: 
   - "vand masina bmw x5 2011" → AUTOTURISME (are "mașină")
   - "vand autoturism audi a4" → AUTOTURISME (are "autoturism")
   - "masina mercedes 2015" → AUTOTURISME (are "mașină")
   
   EXEMPLE GREȘITE (NU alege Autoturisme pentru acestea):
   - "vand aripa bmw x5 2011" → PIESE AUTO (are "aripă", chiar dacă are model și an)
   - "aripă de BMW X5" → PIESE AUTO (are "aripă")
   - "capotă Audi A4 2015" → PIESE AUTO (are "capotă")

3. TELEFOANE MOBILE:
   Dacă textul menționează: "iphone", "samsung", "xiaomi", "huawei", "telefon", "smartphone", "mobil"
   Alege "Electronice & Tehnologie > Telefoane Mobile"

4. LAPTOPURI ȘI PC-URI:
   Dacă textul menționează: "laptop", "notebook", "computer", "pc", "desktop"
   Alege "Electronice & Tehnologie > Laptopuri și PC-uri"

5. IMOBILIARE:
   Dacă textul menționează: "apartament", "casă", "vila", "teren", "imobil"
   Alege "Imobiliare > Apartamente" sau "Imobiliare > Case și Vile"

ALGORITM DE DECIZIE (FOARTE IMPORTANT):
1. Verifică PRIMUL dacă există cuvinte cheie de PIESE AUTO (regula 1)
2. Dacă DA → "Autovehicule > Piese Auto și Accesorii" (CHIAR DACĂ apare și model de mașină sau an)
3. Dacă NU → verifică dacă este mașină întreagă (regula 2)
4. Dacă este mașină întreagă → "Autovehicule > Autoturisme"
5. Dacă NU → continuă cu celelalte reguli

REGULĂ DE AUR: 
- Dacă textul conține o PIESĂ (aripă, capotă, far, etc.) → PIESE AUTO (indiferent de model sau an)
- Dacă textul conține "mașină", "autoturism", "vehicul" → AUTOTURISME (doar dacă NU este piesă)

Răspunde DOAR cu JSON valid în formatul:
{
  "category": "nume categorie exact",
  "subcategory": "nume subcategorie exact"
}

EXEMPLE CORECTE:

"vand aripa bmw x5" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"Vând aripă de BMW X5 2011" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"aripă x5 bmw" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"aripă BMW X5 2011" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"vand faruri audi" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"cutie viteze mercedes" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"jante bmw" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"piese bmw" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}
"capotă Audi A4 2015" → {"category": "Autovehicule", "subcategory": "Piese Auto și Accesorii"}

"vand masina bmw x5" → {"category": "Autovehicule", "subcategory": "Autoturisme"}
"vand autoturism audi a4" → {"category": "Autovehicule", "subcategory": "Autoturisme"}

"vand iphone 17" → {"category": "Electronice & Tehnologie", "subcategory": "Telefoane Mobile"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Ești un expert în clasificarea anunțurilor. Răspunde DOAR cu JSON valid, fără text suplimentar, fără markdown, fără explicații.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      return NextResponse.json({ error: 'OpenAI API error' }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error('No content in OpenAI response');
      return NextResponse.json({ error: 'No content in response' }, { status: 500 });
    }

    // Parsează JSON din răspuns (poate conține markdown code blocks)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0].trim();
    }

    const result = JSON.parse(jsonStr);
    const category = result.category;
    const subcategory = result.subcategory;

    if (!category || !subcategory) {
      console.error('Invalid category/subcategory from ChatGPT:', result);
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Verifică dacă categoria și subcategoria există în templates
    const categoryData = (descriptionTemplates as any)[category];
    if (!categoryData) {
      console.error(`Category "${category}" not found in templates`);
      return NextResponse.json({ error: `Category "${category}" not found` }, { status: 400 });
    }

    const subcategoryData = categoryData[subcategory];
    if (!subcategoryData) {
      console.error(`Subcategory "${subcategory}" not found in category "${category}"`);
      return NextResponse.json({ error: `Subcategory "${subcategory}" not found` }, { status: 400 });
    }

    return NextResponse.json({
      category,
      subcategory,
      requiredFields: subcategoryData.requiredFields || []
    });
  } catch (error: any) {
    console.error('Error detecting category:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
