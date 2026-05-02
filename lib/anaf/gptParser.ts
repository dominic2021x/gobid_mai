import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * GPT Parser pentru ANAF
 * Parsează textul extras din PDF-uri ANAF folosind GPT-4o
 * și extrage informații structurate în format JSON
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface ANAFBun {
  // Informații generale
  denumire?: string; // Denumirea bunului mobil
  descriere_sumara?: string; // Descriere sumară
  tip_bun: string; // 'autoturism', 'teren', 'constructie', 'bun_mobil', etc.
  categoria_teren?: string; // 'intravilan', 'extravilan', 'arabil', 'faneata', 'livada', etc.
  suprafata_totala?: number; // în mp sau ha
  unitate_suprafata?: 'mp' | 'ha';
  pret_evaluare: number;
  tva_inclus: boolean;
  valoare_tva?: number;
  cota_tva?: string; // '21%', 'neimpozabil', 'scutit'
  // drepturi_reale eliminat - nu trebuie extras (conține date personale)
  
  // Câmpuri specifice pentru Autoturisme
  marca?: string; // Ex: Opel, Ford
  model?: string; // Ex: Astra, Edge
  culoare?: string; // Ex: Gri, Portocaliu
  caroserie?: string; // Ex: Berlina, Break, SUV
  an_fabricatie?: number; // Ex: 2015, 2017
  rulaj?: number; // Ex: 233144, 115297 (în KM)
  combustibil?: string; // Ex: Benzina, Diesel, GPL, Electric, Hibrid
  putere?: number; // Ex: 74, 154.5 (în KW sau CP)
  putere_unitate?: 'KW' | 'CP'; // Unitatea de măsură pentru putere
  capacitate_cilindrica?: number; // Ex: 1997 (în CMC sau cm³)
  serie_sasiu?: string; // Ex: JW 0LPD 6EB6FG087935
  serie_motor?: string; // Ex: HBB50108
  // nr_inmatriculare eliminat - nu este necesar
  transmisie?: string; // Ex: Fata, Integrala, Manuală, Automată
  clasa_emisii?: string; // Ex: Euro 6, Euro 5
  stare_uzura?: string; // Ex: folosit, nou, foarte bună
  semne_particulare?: string; // Ex: fara semne particulare
  
  // Câmpuri specifice pentru Imobiliare
  numar_camere?: number;
  numar_dormitoare?: number;
  numar_bai?: number;
  etaj?: string;
  an_constructie?: number;
  compartimentare?: string;
  destinatie?: string;
  acces?: string;
  utilitati?: string;
  
  // Câmpuri specifice pentru Utilaje
  tip_utilaj?: string;
  capacitate_incarcare?: number;
  dimensiuni?: string;
  
  [key: string]: any; // Pentru alte câmpuri suplimentare
}

export interface ANAFLicitatieData {
  judet: string;
  localitate: string;
  adresa: string;
  // nume_contribuabil eliminat - nu este necesar
  numar_licitatie: string; // 'I', 'II', 'III', 'IV'
  data_licitatie: string; // Format: 'YYYY-MM-DD'
  ora_licitatie: string; // Format: 'HH:MM'
  loc_licitatie: string;
  conditii_suplimentare: {
    garantie?: string;
    cont_bancar?: string;
    termene?: string;
    acte_necesare?: string;
    [key: string]: any;
  };
  detalii_relevante?: string;
  
  // IMPORTANT: Un PDF poate conține mai multe bunuri
  bunuri: ANAFBun[]; // Array de bunuri din același PDF
  
  // Câmpuri pentru compatibilitate (dacă există un singur bun)
  tip_bun?: string; // Pentru backwards compatibility
  categoria_teren?: string;
  suprafata_totala?: number;
  unitate_suprafata?: 'mp' | 'ha';
  pret_evaluare?: number;
  tva_inclus?: boolean;
  valoare_tva?: number;
  moneda?: 'RON' | 'EUR';
  
  [key: string]: any;
}

/**
 * Parsează textul unui PDF ANAF folosind GPT-4o
 * @param pdfText Textul extras din PDF
 * @returns Datele structurate ale licitației
 */
export async function parseANAFPDFWithGPT(pdfText: string): Promise<ANAFLicitatieData> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const systemPrompt = `Ești un expert în analiza documentelor ANAF pentru licitații publice.
Sarcina ta este să extragi toate informațiile relevante dintr-un document PDF ANAF și să le returnezi într-un format JSON structurat.

IMPORTANT: Un PDF ANAF poate conține MAI MULTE BUNURI (ex: 2 autoturisme, 3 terenuri, etc.).
Trebuie să extragi TOATE bunurile din PDF și să le returnezi într-un array "bunuri".

ATENȚIE LA TABELE:
- Dacă PDF-ul conține un tabel cu bunuri mobile, fiecare RÂND din tabel reprezintă un bun separat
- Coloanele tabelului conțin de obicei: "Denumirea bunului mobil", "Descriere sumară", "Prețul de evaluare", "Cota TVA"
- Pentru fiecare rând din tabel, creează un obiect bun separat în array-ul "bunuri"
- Nu combina mai multe bunuri într-un singur obiect - fiecare rând = un bun separat
- Dacă vezi un tabel cu mai multe rânduri de date (ex: 2 autoturisme), trebuie să creezi 2 obiecte separate în array-ul "bunuri"

Pentru fiecare bun, extrage următoarele informații:

INFORMAȚII GENERALE (pentru toate bunurile):
1. Denumirea bunului mobil (ex: "Autoturism marca Opel model Astra") - din coloana "Denumirea bunului mobil"
2. Descriere sumară (toate detaliile despre bun) - din coloana "Descriere sumară"
3. Tipul bunului (autoturism, teren, construcție, bun mobil, etc.) - dedus din denumire sau descriere
4. Prețul de evaluare (exclusiv TVA sau inclusiv TVA) - din coloana "Prețul de evaluare sau de pornire a licitației"
5. Cota TVA (ex: "21%", "neimpozabil", "scutit") - din coloana "Cota TVA/neimpozabil/scutit"
6. NU extrage drepturile reale sau privilegiile care grevează bunurile (conțin date personale - este ilegal)

PENTRU AUTOTURISME (dacă tip_bun = "autoturism" sau "auto"):
- marca (ex: Opel, Ford, BMW)
- model (ex: Astra, Edge, X5)
- culoare (ex: Gri, Portocaliu, Negru)
- caroserie (ex: Berlina, Break, SUV, Sedan, Hatchback)
- an_fabricatie (ex: 2015, 2017)
- rulaj (în KM, ex: 233144, 115297)
- combustibil (ex: Benzina, Diesel, GPL, Electric, Hibrid)
- putere (în KW sau CP, ex: 74, 154.5)
- putere_unitate ("KW" sau "CP")
- capacitate_cilindrica (în CMC sau cm³, ex: 1997)
- serie_sasiu (ex: JW 0LPD 6EB6FG087935)
- serie_motor (ex: HBB50108)
- transmisie (ex: Fata, Integrala, Manuală, Automată, CVT)
- clasa_emisii (ex: Euro 6, Euro 5, Euro 4)
- stare_uzura (ex: folosit, nou, foarte bună, bună, uzată)
- semne_particulare (ex: fara semne particulare, accidentat, etc.)
- NU extrage numărul de înmatriculare (ignoră complet acest câmp)

PENTRU TERENURI (dacă tip_bun = "teren"):
- categoria_teren (intravilan, extravilan, arabil, fâneață, livadă, etc.)
- suprafata_totala (în mp sau ha)
- unitate_suprafata ("mp" sau "ha")
- destinatie (construcție, comercial, industrial, etc.)
- acces (asfaltat, pământ, fără acces)

PENTRU CONSTRUCȚII/IMOBILIARE (dacă tip_bun = "constructie" sau "imobil"):
- numar_camere
- numar_dormitoare
- numar_bai
- etaj
- an_constructie
- suprafata_totala (în mp)
- compartimentare (decomandat, semidecomandat, etc.)

INFORMAȚII DESPRE LICITAȚIE (comune pentru toate bunurile):
1. Județul (ex: "București", "Cluj", "Iași", "Timiș", "Constanța")
2. Localitatea/Orașul (ex: "București", "Cluj-Napoca", "Timișoara", "Constanța")
3. Adresa exactă (str., nr., etc.)
4. Numărul licitației (I, II, III, IV sau "prima", "a doua", "a treia", "a patra")
5. Data licitației (zi, lună, an) - format: YYYY-MM-DD
6. Ora licitației - format: HH:MM
7. Locul desfășurării licitației
8. Condiții suplimentare (garantie, cont bancar, termene, acte necesare)
9. Orice alte detalii relevante din document
- NU extrage numele contribuabilului/debitorului (ignoră complet acest câmp)

IMPORTANT:
- Returnează DOAR JSON valid, fără text suplimentar
- Structura JSON: { judet, localitate, adresa, numar_licitatie, data_licitatie, ora_licitatie, loc_licitatie, conditii_suplimentare, detalii_relevante, bunuri: [...] }
- "bunuri" este un ARRAY - poate conține 1 sau mai multe bunuri
- Pentru fiecare bun în array, include toate câmpurile specifice (marca, model, culoare, etc. pentru autoturisme)
- NU include nume_contribuabil sau nr_inmatriculare în JSON (ignoră complet aceste câmpuri)
- Folosește null sau string gol pentru câmpuri lipsă
- Data trebuie să fie în format YYYY-MM-DD
- Ora trebuie să fie în format HH:MM
- Prețurile trebuie să fie numere, nu string-uri
- Dacă nu găsești o informație, folosește null sau string gol
- Moneda implicită este Lei dacă nu este specificată
- Dacă nu găsești județul sau localitatea, folosește "Necunoscut" (nu null)
- Dacă nu găsești prețul pentru un bun, folosește null (NU 0) - sistemul va folosi fallback-uri
- ATENȚIE: Localitatea poate apărea de mai multe ori în text - folosește prima apariție relevantă din contextul licitației
- Pentru București: dacă găsești "București" cu sau fără secțiune, județul este "București"
- EXEMPLU: Dacă PDF-ul conține 2 autoturisme, "bunuri" trebuie să fie un array cu 2 obiecte, fiecare cu toate detaliile specifice

NORMALIZARE PREȚ PENTRU OCR:
Dacă textul provine din OCR, numerele pot fi distorsionate (ex: 26ZOO, 26 200, 26.OO, 2 6 2 0 0).
Normalizați valorile astfel:
- Z→2, O→0, l→1, D→0, S→5
- Eliminați spații și caractere non-numerice
- Unește cifrele separate de spații
- Dacă găsiți un număr de 4-7 cifre în linia prețului de evaluare, acela este prețul corect
- Dacă nu poți determina prețul exact, returnați null în loc de 0`;

  const userPrompt = `Extrage toate informațiile relevante din următorul text dintr-un document PDF ANAF:

${pdfText}

IMPORTANT: 
- Dacă textul conține un tabel cu bunuri mobile, extrage TOATE bunurile din tabel
- Fiecare rând din tabel reprezintă un bun separat care trebuie adăugat în array-ul "bunuri"
- Pentru fiecare bun, extrage denumirea, descrierea sumară, prețul de evaluare și cota TVA din coloanele corespunzătoare
- Dacă există mai multe bunuri în același tabel, creează un obiect separat pentru fiecare
- Verifică dacă există coloane cu "Denumirea bunului mobil", "Descriere sumară", "Prețul de evaluare", "Cota TVA" și extrage datele din fiecare rând

Returnează rezultatul în format JSON valid, respectând structura specificată.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.1, // Temperatură mică pentru extragere precisă
      max_tokens: 4000, // Mărit pentru a permite extragerea completă a tuturor bunurilor din tabele
      response_format: { type: 'json_object' }, // Forțează răspuns JSON
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('Empty response from GPT');
    }

    // Parsează JSON-ul
    let parsedData: ANAFLicitatieData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse GPT response as JSON:', responseText);
      throw new Error(`Invalid JSON response from GPT: ${parseError}`);
    }

    // Validează și completează câmpurile obligatorii cu valori default
    // Normalizează județul și localitatea
    // Asigură-te că parsedData are câmpurile necesare
    if (!parsedData) {
      parsedData = {} as ANAFLicitatieData;
    }
    
    // Asigură-te că există array-ul de bunuri
    if (!parsedData.bunuri || !Array.isArray(parsedData.bunuri)) {
      // Dacă nu există array-ul, creează unul din câmpurile vechi (backwards compatibility)
      const singleBun: ANAFBun = {
        tip_bun: parsedData.tip_bun || 'alte',
        categoria_teren: parsedData.categoria_teren,
        suprafata_totala: parsedData.suprafata_totala,
        unitate_suprafata: parsedData.unitate_suprafata,
        pret_evaluare: parsedData.pret_evaluare || 0,
        tva_inclus: parsedData.tva_inclus || false,
        valoare_tva: parsedData.valoare_tva,
        moneda: parsedData.moneda || 'RON',
      };
      parsedData.bunuri = [singleBun];
    }
    
    // Validează și completează fiecare bun
    parsedData.bunuri = parsedData.bunuri.map((bun: any) => {
      // NU mai setăm prețul la 0 automat - lăsăm null pentru fallback-uri
      if (bun.pret_evaluare === undefined || bun.pret_evaluare === null) {
        bun.pret_evaluare = null;
        console.log(`[GPT Parser] Bun "${bun.denumire || bun.tip_bun}" fără preț, lăsat null pentru fallback`);
      } else if (bun.pret_evaluare === 0) {
        // Dacă GPT a returnat 0, considerăm că nu a găsit prețul
        bun.pret_evaluare = null;
        console.log(`[GPT Parser] Bun "${bun.denumire || bun.tip_bun}" cu preț 0, setat la null pentru fallback`);
      }
      if (bun.tva_inclus === undefined) {
        bun.tva_inclus = false;
      }
      if (!bun.moneda) {
        bun.moneda = 'RON';
      }
      
      // Normalizează an_fabricatie - elimină puncte și convertește în număr întreg
      if (bun.an_fabricatie !== undefined && bun.an_fabricatie !== null) {
        try {
          const originalValue = bun.an_fabricatie;
          if (typeof originalValue === 'string') {
            // Elimină puncte și spații, apoi convertește în număr
            const normalized = originalValue.replace(/[.\s]/g, '');
            const year = parseInt(normalized, 10);
            if (!isNaN(year) && year > 1900 && year <= new Date().getFullYear() + 1) {
              bun.an_fabricatie = year;
              console.log(`[GPT Parser] Normalized an_fabricatie: "${originalValue}" → ${year}`);
            } else {
              // Dacă nu este valid, setează la null
              bun.an_fabricatie = null;
              console.warn(`[GPT Parser] Invalid an_fabricatie: "${originalValue}", set to null`);
            }
          } else if (typeof originalValue === 'number') {
            // Dacă este deja număr, asigură-te că este întreg
            bun.an_fabricatie = Math.round(originalValue);
          }
        } catch (error: any) {
          console.warn(`[GPT Parser] Error normalizing an_fabricatie: ${error.message}`);
          // Continuă cu valoarea originală dacă normalizarea eșuează
        }
      }
      
      // Normalizează capacitate_cilindrica - elimină puncte și convertește în număr întreg
      if (bun.capacitate_cilindrica !== undefined && bun.capacitate_cilindrica !== null) {
        try {
          const originalValue = bun.capacitate_cilindrica;
          if (typeof originalValue === 'string') {
            // Elimină puncte, spații și unități (cm³, CMC, etc.)
            const normalized = originalValue.replace(/[.\s]/g, '').replace(/[^0-9]/g, '');
            const capacity = parseInt(normalized, 10);
            if (!isNaN(capacity) && capacity > 0) {
              bun.capacitate_cilindrica = capacity;
              console.log(`[GPT Parser] Normalized capacitate_cilindrica: "${originalValue}" → ${capacity}`);
            } else {
              // Dacă nu este valid, setează la null
              bun.capacitate_cilindrica = null;
              console.warn(`[GPT Parser] Invalid capacitate_cilindrica: "${originalValue}", set to null`);
            }
          } else if (typeof originalValue === 'number') {
            // Dacă este deja număr, asigură-te că este întreg
            bun.capacitate_cilindrica = Math.round(originalValue);
          }
        } catch (error: any) {
          console.warn(`[GPT Parser] Error normalizing capacitate_cilindrica: ${error.message}`);
          // Continuă cu valoarea originală dacă normalizarea eșuează
        }
      }
      
      return bun;
    });

    // Log pentru debugging prețuri
    console.log(`[GPT Parser] Pret evaluare licitație: ${parsedData.pret_evaluare || 'N/A'}`);
    console.log(`[GPT Parser] Bunuri cu prețuri:`, parsedData.bunuri.map((b: any) => ({
      tip: b.tip_bun || b.denumire,
      pret: b.pret_evaluare,
      moneda: b.moneda
    })));
    
    // Inițializează câmpurile dacă nu există
    // Verifică dacă judet există și este valid
    const hasJudet = parsedData.judet && 
      typeof parsedData.judet === 'string' && 
      parsedData.judet.trim() !== '' && 
      parsedData.judet.trim().toLowerCase() !== 'null';
    
    if (!hasJudet) {
      // Încearcă să deducă județul din localitate
      const hasLocalitate = parsedData.localitate && 
        typeof parsedData.localitate === 'string' && 
        parsedData.localitate.trim() !== '' && 
        parsedData.localitate.trim().toLowerCase() !== 'null';
      
      if (hasLocalitate) {
        const localitate = parsedData.localitate.trim();
        // Dacă localitatea este București, județul este București
        if (localitate.toLowerCase().includes('bucurești') || localitate.toLowerCase().includes('bucuresti')) {
          parsedData.judet = 'București';
          console.log(`[GPT Parser] Deduced judet "București" from localitate "${localitate}"`);
        } else {
          // Încearcă să găsească județul din lista cunoscută
          const judete = [
            'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
            'Brașov', 'Brăila', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
            'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita',
            'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș',
            'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare', 'Sibiu', 'Suceava',
            'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea'
          ];
          
          // Caută județul în localitate sau viceversa
          const foundJudet = judete.find(j => 
            localitate.toLowerCase().includes(j.toLowerCase()) || 
            j.toLowerCase().includes(localitate.toLowerCase().split('-')[0])
          );
          
          if (foundJudet) {
            parsedData.judet = foundJudet;
            console.log(`[GPT Parser] Deduced judet "${foundJudet}" from localitate "${localitate}"`);
          } else {
            parsedData.judet = 'Necunoscut';
            console.warn(`[GPT Parser] Missing judet, using default "Necunoscut"`);
          }
        }
      } else {
        parsedData.judet = 'Necunoscut';
        console.warn('[GPT Parser] Missing judet and localitate, using default "Necunoscut"');
      }
    }

    // Verifică dacă localitate există și este validă
    const hasLocalitate = parsedData.localitate && 
      typeof parsedData.localitate === 'string' && 
      parsedData.localitate.trim() !== '' && 
      parsedData.localitate.trim().toLowerCase() !== 'null';
    
    if (!hasLocalitate) {
      console.warn('[GPT Parser] Missing localitate, using default "Necunoscut"');
      parsedData.localitate = 'Necunoscut';
    } else {
      // Normalizează localitatea - elimină secțiunea dacă este București
      const localitate = parsedData.localitate.trim();
      if (localitate.toLowerCase().includes('bucurești') || localitate.toLowerCase().includes('bucuresti')) {
        // Dacă conține "sec." sau "sector", păstrează doar "București"
        parsedData.localitate = localitate.replace(/\s*,\s*sec\.?\s*\d+/i, '').replace(/\s*,\s*sector\s*\d+/i, '').trim();
        if (!parsedData.localitate) {
          parsedData.localitate = 'București';
        }
      }
    }
    
    // Asigură-te că ambele câmpuri sunt setate înainte de return
    if (!parsedData.judet || parsedData.judet === '') {
      parsedData.judet = 'Necunoscut';
    }
    if (!parsedData.localitate || parsedData.localitate === '') {
      parsedData.localitate = 'Necunoscut';
    }

    // NU mai setăm prețul la 0 automat - lăsăm undefined pentru fallback-uri
    if (!parsedData.pret_evaluare || parsedData.pret_evaluare === 0) {
      parsedData.pret_evaluare = undefined;
      console.log('[GPT Parser] Missing pret_evaluare, lăsat undefined pentru fallback');
    }

    // Normalizează datele
    if (parsedData.data_licitatie) {
      // Asigură-te că data este în format corect
      const dateMatch = parsedData.data_licitatie.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!dateMatch) {
        // Încearcă să parsezi alte formate de dată
        const date = new Date(parsedData.data_licitatie);
        if (!isNaN(date.getTime())) {
          parsedData.data_licitatie = date.toISOString().split('T')[0];
        }
      }
    }

    // Normalizează ora
    if (parsedData.ora_licitatie) {
      const timeMatch = parsedData.ora_licitatie.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) {
        // Încearcă să normalizezi ora
        const timeStr = parsedData.ora_licitatie.replace(/[^\d:]/g, '');
        if (timeStr.match(/\d{1,2}:\d{2}/)) {
          parsedData.ora_licitatie = timeStr;
        }
      }
    }

    // Asigură-te că conditii_suplimentare este un obiect
    if (!parsedData.conditii_suplimentare || typeof parsedData.conditii_suplimentare !== 'object') {
      parsedData.conditii_suplimentare = {};
    }

    return parsedData;
  } catch (error: any) {
    console.error('Error parsing ANAF PDF with GPT:', error);
    throw new Error(`GPT parsing failed: ${error.message}`);
  }
}

