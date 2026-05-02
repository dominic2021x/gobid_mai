import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Configurare runtime pentru Next.js
export const runtime = 'nodejs';

// Rate limiting simplu în memorie (pentru dev)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minut
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 request-uri pe minut per IP

/**
 * Interfață pentru datele generale ANAF
 */
interface ANAFDateGenerale {
  cui?: string;
  denumire?: string;
  adresa?: string;
  numar_inmatriculare?: string;
  cod_postal?: string;
  telefon?: string;
  fax?: string;
  codStareLegal?: string;
  strada?: string;
  numarStrada?: string;
  bloc?: string;
  scara?: string;
  etaj?: string;
  apartament?: string;
  localitate?: string;
  judet?: string;
  tara?: string;
  activ?: boolean;
  dataInceputActivitate?: string;
  dataSfarsitActivitate?: string;
  codCaen?: string;
  platitorTVA?: boolean;
  [key: string]: any; // Pentru câmpuri adiționale necunoscute
}

/**
 * Interfață pentru un element found în răspunsul ANAF
 */
interface ANAFFoundItem {
  date_generale?: ANAFDateGenerale;
  date?: Array<ANAFDateGenerale>;
  cui?: string;
  denumire?: string;
  [key: string]: any;
}

/**
 * Interfață pentru răspunsul ANAF
 * ANAF poate returna fie un obiect, fie un array direct
 */
type ANAFResponse = {
  cod?: number;
  message?: string;
  found?: Array<ANAFFoundItem>;
  not_found?: Array<{ cui: string }>;
} | Array<{
  found?: Array<ANAFFoundItem>;
  not_found?: Array<{ cui: string }>;
  [key: string]: any;
}>;

/**
 * Interfață pentru răspunsul nostru standardizat
 */
interface CompanyDataResponse {
  cui: string;
  denumire: string;
  nrRegCom: string;
  adresa: string;
  judet: string;
  localitate: string;
  codCaen?: string;
  platitorTva?: boolean;
  status?: string;
}

/**
 * Rate limiting simplu pe IP
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    // Reset sau primul request
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

/**
 * Normalizează CUI-ul: extrage doar cifrele
 * Acceptă: "RO12345678", "ro12345678", "12345678"
 */
function normalizeCUI(cui: string): string {
  return cui.replace(/\D/g, '');
}

/**
 * Validează că CUI-ul are între 2 și 10 cifre
 */
function validateCUI(cuiDigits: string): { valid: boolean; error?: string } {
  if (!cuiDigits || cuiDigits.length < 2) {
    return { valid: false, error: 'CUI invalid: trebuie să conțină cel puțin 2 cifre' };
  }
  if (cuiDigits.length > 10) {
    return { valid: false, error: 'CUI invalid: nu poate conține mai mult de 10 cifre' };
  }
  return { valid: true };
}

/**
 * Extrage datele din obiectul date_generale și returnează datele (nu NextResponse)
 */
function extractCompanyData(dateGenerale: ANAFDateGenerale, cui: string): CompanyDataResponse | null {
  console.log('[ANAF API] 🔄 Extracting from dateGenerale, keys:', Object.keys(dateGenerale));

  // Construiește adresa completă din componente
  const adresaParts: string[] = [];
  if (dateGenerale.strada) adresaParts.push(`Str. ${dateGenerale.strada}`);
  if (dateGenerale.numarStrada) adresaParts.push(`Nr. ${dateGenerale.numarStrada}`);
  if (dateGenerale.bloc) adresaParts.push(`Bl. ${dateGenerale.bloc}`);
  if (dateGenerale.scara) adresaParts.push(`Sc. ${dateGenerale.scara}`);
  if (dateGenerale.etaj) adresaParts.push(`Et. ${dateGenerale.etaj}`);
  if (dateGenerale.apartament) adresaParts.push(`Ap. ${dateGenerale.apartament}`);
  
  // Dacă există adresa completă, o folosim; altfel construim din părți; dacă lipsește, string gol
  const adresaCompleta = dateGenerale.adresa || adresaParts.join(', ') || '';

  // Extrage cod CAEN (poate fi în diferite câmpuri)
  const codCaen = dateGenerale.codCaen || (dateGenerale as any).caen || (dateGenerale as any).cod_caen || undefined;

  // Extrage statusul platitor TVA (activ = platitor TVA)
  const platitorTva = dateGenerale.activ !== undefined 
    ? dateGenerale.activ 
    : (dateGenerale.platitorTVA !== undefined ? dateGenerale.platitorTVA : undefined);

  // Extrage judet și localitate din adresa_sediu_social (v9) sau direct (v7/v8)
  const adresaSediuSocial = (dateGenerale as any).adresa_sediu_social || {};
  const judetValue = dateGenerale.judet || 
                     (dateGenerale as any).judet_sediu || 
                     adresaSediuSocial.ddenumire_Judet ||
                     adresaSediuSocial.sdenumire_Judet ||
                     '';
  
  const localitateValue = dateGenerale.localitate || 
                          dateGenerale.oras || 
                          (dateGenerale as any).localitate_sediu ||
                          adresaSediuSocial.ddenumire_Localitate ||
                          adresaSediuSocial.sdenumire_Localitate ||
                          '';

  // Mapează câmpurile - folosește string gol dacă lipsesc (NU crăpa)
  // Suportă atât formatul v7/v8 (snake_case) cât și v9 (camelCase)
  const result: CompanyDataResponse = {
    cui: String(dateGenerale.cui || cui).trim() || cui,
    denumire: (dateGenerale.denumire || '').trim(),
    nrRegCom: (dateGenerale.numar_inmatriculare || 
               (dateGenerale as any).nrRegCom || 
               (dateGenerale as any).nr_reg_com || 
               '').trim(),
    adresa: adresaCompleta.trim() || (dateGenerale.adresa || '').trim(),
    judet: String(judetValue).trim(),
    localitate: String(localitateValue).trim(),
    codCaen: codCaen ? String(codCaen).trim() : undefined,
    platitorTva: platitorTva !== undefined ? Boolean(platitorTva) : undefined,
    status: dateGenerale.codStareLegal ? String(dateGenerale.codStareLegal).trim() : undefined,
  };

  console.log('[ANAF API] ✅ Extracted result:', JSON.stringify(result, null, 2));
  
  // Verifică dacă avem cel puțin denumirea sau CUI-ul (date minime)
  const hasMinimalData = (result.denumire && result.denumire.trim()) || 
                         (result.cui && result.cui.trim());

  if (!hasMinimalData) {
    console.log('[ANAF API] ❌ No minimal data found (no denumire or cui)');
    return null;
  }

  return result;
}

/**
 * Endpoint POST pentru căutarea datelor firmei după CUI folosind ANAF
 */
export async function POST(request: NextRequest) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('[ANAF API] ⚡ HIT /api/company/anaf');
  console.log('[ANAF API] Timestamp:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════');
  
  // Debug info pentru development
  const isDev = process.env.NODE_ENV !== 'production';
  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    endpoint: '/api/company/anaf'
  };
  
  try {
    // MOCK FALLBACK - pentru testare fără ANAF
    const mockEnabled = process.env.MOCK_COMPANY_LOOKUP === '1';
    if (mockEnabled) {
      console.log('[ANAF API] 🔧 MOCK MODE ENABLED - returning test data');
      debugInfo.mockMode = true;
      
      // Parse body pentru a verifica CUI-ul
      const body = await request.json().catch(() => ({}));
      const { cui } = body;
      const cuiNormalized = cui ? normalizeCUI(cui) : '12345678';
      
      // Returnează mock data pentru CUI 12345678 sau orice CUI în mock mode
      const mockData = {
        cui: cuiNormalized || '12345678',
        denumire: 'FIRMA TEST SRL',
        nrRegCom: 'J40/1234/2020',
        adresa: 'București, Str. Test 1',
        judet: 'București',
        localitate: 'București',
        codCaen: undefined,
        platitorTva: true,
        status: undefined
      };
      
      console.log('[ANAF API] ✅ Returning mock data:', mockData);
      return NextResponse.json({
        ...mockData,
        ...(isDev && { debug: { ...debugInfo, mockData } })
      });
    }

    // Rate limiting pe IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    debugInfo.clientIp = ip;
    
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      console.log('[ANAF API] ⚠️ Rate limit exceeded for IP:', ip);
      return NextResponse.json(
        { 
          error: 'Prea multe cereri. Te rugăm să încerci din nou peste un minut.',
          retryAfter: 60
        },
        { status: 429 }
      );
    }

    // Parse body
    let body: any;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('[ANAF API] ❌ Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Body invalid - trebuie să fie JSON valid' },
        { status: 400 }
      );
    }
    
    const { cui } = body;
    const cuiRaw = cui;
    
    console.log('[ANAF API] 📥 Request body received:', { cui: cuiRaw });
    debugInfo.cuiRaw = cuiRaw;

    // Verifică că avem CUI (obligatoriu)
    if (!cui || typeof cui !== 'string' || !cui.trim()) {
      console.log('[ANAF API] ❌ Invalid CUI - missing or not string');
      return NextResponse.json(
        { error: 'CUI este obligatoriu și trebuie să fie un string' },
        { status: 400 }
      );
    }

    // Normalizează CUI (extrage doar cifrele)
    const cuiNormalized = normalizeCUI(cui);
    console.log('[ANAF API] 🔢 CUI normalized:', cuiRaw, '→', cuiNormalized);
    debugInfo.cuiNormalized = cuiNormalized;
    debugInfo.cuiDigits = cuiNormalized;

    // Validează CUI
    const validation = validateCUI(cuiNormalized);
    if (!validation.valid) {
      console.log('[ANAF API] ❌ CUI validation failed:', validation.error);
      return NextResponse.json(
        { error: validation.error || 'CUI invalid' },
        { status: 400 }
      );
    }

    // Apelează API-ul ANAF
    // ANAF așteaptă un ARRAY cu un obiect: [{ cui: "număr", data: "YYYY-MM-DD" }]
    // URL-ul poate fi configurat prin variabilă de mediu, altfel se încearcă variantele disponibile
    // Versiuni disponibile: v9 (funcționează), v7 (404), v8 (404)
    // NOTĂ: v9 este verificat și funcționează (returnează 200 OK cu JSON valid)
    const anafUrlConfig = process.env.ANAF_API_URL;
    const anafUrlVersions = [
      'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva',     // v9 - funcționează ✅
      'https://webservicesp.anaf.ro/PlatitorTvaRest/api/v7/ws/tva',  // v7 - fallback (returnează 404)
      'https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva',  // v8 - fallback (returnează 404)
    ];
    const currentDate = new Date().toISOString().split('T')[0];

    // Construiește payload-ul corect ca ARRAY
    const anafPayload = [
      {
        cui: cuiNormalized, // Doar cifre, fără "RO" sau alte caractere
        data: currentDate    // Format: "YYYY-MM-DD"
      }
    ];

    debugInfo.anafPayload = anafPayload;

    // Încearcă mai întâi URL-ul configurat manual, apoi variantele disponibile
    const urlsToTry = anafUrlConfig ? [anafUrlConfig] : anafUrlVersions;
    let anafResponse: Response | null = null;
    let anafBodyText: string = '';
    let anafStatus: number = 0;
    let anafStatusText: string = '';
    let anafUrl: string = '';
    let lastError: any = null;

    // Încearcă fiecare URL până găsește unul care funcționează
    for (const url of urlsToTry) {
      anafUrl = url;
      console.log('[ANAF API] 🌐 Trying ANAF URL:', anafUrl);
      debugInfo.anafUrl = anafUrl;
      debugInfo.anafUrlAttempted = url;

      // Timeout de 15 secunde pentru request-ul către ANAF
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        console.log('[ANAF API] 📡 Sending fetch request to ANAF...');
        anafResponse = await fetch(anafUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; gobid.ro/1.0)',
          },
          body: JSON.stringify(anafPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        anafStatus = anafResponse.status;
        anafStatusText = anafResponse.statusText;
        
        console.log('[ANAF API] 📥 ANAF Response received');
        console.log('[ANAF API] 📥 Status:', anafStatus, anafStatusText);
        
        const headersObj: Record<string, string> = {};
        anafResponse.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
        console.log('[ANAF API] 📥 Response headers:', headersObj);
        
        debugInfo.anafStatus = anafStatus;
        debugInfo.anafStatusText = anafStatusText;
        debugInfo.anafHeaders = headersObj;

        // Citește body-ul ca TEXT pentru debug înainte de parse
        try {
          anafBodyText = await anafResponse.text();
          console.log('[ANAF API] 📥 Response body (raw text, length):', anafBodyText.length, 'chars');
          console.log('[ANAF API] 📥 Response body (first 1000 chars):', anafBodyText.substring(0, 1000));
          debugInfo.anafBodySnippet = anafBodyText.substring(0, 500);
          debugInfo.anafBodyLength = anafBodyText.length;
        } catch (textError: any) {
          console.error('[ANAF API] ❌ Failed to read response as text:', textError);
          anafBodyText = '';
          debugInfo.anafBodyReadError = textError.message;
        }

        // Verifică dacă este HTML (404 sau alte erori HTML de la ANAF)
        if (anafBodyText.trim().startsWith('<!') || anafBodyText.trim().startsWith('<html') || anafBodyText.includes('<title>404')) {
          console.error('[ANAF API] ⚠️ URL returned HTML (404), trying next URL...');
          debugInfo.anafUrlFailed = url;
          debugInfo.anafUrlFailedReason = 'HTML response (404)';
          // Continuă la următorul URL
          continue;
        }

        // Dacă status-ul este OK (200), folosește acest URL
        if (anafResponse.ok && anafStatus === 200) {
          console.log('[ANAF API] ✅ URL works:', anafUrl);
          debugInfo.anafUrlWorking = anafUrl;
          break; // URL-ul funcționează, ieșim din loop
        }

        // Dacă este 404, încearcă următorul URL
        if (anafStatus === 404) {
          console.error('[ANAF API] ⚠️ URL returned 404, trying next URL...');
          debugInfo.anafUrlFailed = url;
          debugInfo.anafUrlFailedReason = '404 Not Found';
          continue;
        }

        // Alt status (nu 200, nu 404), încearcă următorul URL
        console.error('[ANAF API] ⚠️ URL returned status:', anafStatus, 'trying next URL...');
        debugInfo.anafUrlFailed = url;
        debugInfo.anafUrlFailedReason = `Status ${anafStatus}`;
        continue;

      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        lastError = fetchError;
        
        if (fetchError.name === 'AbortError') {
          console.error('[ANAF API] ⏱️ Request timeout for URL:', anafUrl);
          debugInfo.anafUrlFailed = url;
          debugInfo.anafUrlFailedReason = 'Timeout';
          // Continuă la următorul URL
          continue;
        }
        
        console.error('[ANAF API] ❌ Fetch error for URL:', anafUrl, fetchError);
        debugInfo.anafUrlFailed = url;
        debugInfo.anafUrlFailedReason = fetchError.message;
        // Continuă la următorul URL
        continue;
      }
    }

    // Dacă niciun URL nu a funcționat
    if (!anafResponse || anafStatus === 0) {
      console.error('[ANAF API] ❌ All ANAF URLs failed');
      debugInfo.error = 'All ANAF URLs failed';
      if (lastError) {
        debugInfo.lastError = {
          name: lastError.name,
          message: lastError.message,
          code: lastError.code
        };
      }
      return NextResponse.json(
        { 
          error: 'Serviciu ANAF indisponibil - toate endpoint-urile au eșuat. Verifică documentația ANAF sau configurează ANAF_API_URL.',
          ...(isDev && { 
            debug: {
              ...debugInfo,
              suggestion: 'Setează ANAF_API_URL în .env.local sau folosește MOCK_COMPANY_LOOKUP=1 pentru testare'
            }
          })
        },
        { status: 503 }
      );
    }

    if (!anafResponse.ok) {
      console.error('[ANAF API] ❌ ANAF API returned error status:', anafStatus);
      
      // Mapping corect al erorilor
      if (anafStatus === 400) {
        return NextResponse.json(
          { 
            error: 'CUI invalid',
            ...(isDev && { debug: debugInfo })
          },
          { status: 400 }
        );
      }
      
      if (anafStatus === 401 || anafStatus === 403) {
        console.error('[ANAF API] ⚠️ ANAF access blocked/unauthorized');
        return NextResponse.json(
          { 
            error: 'Acces ANAF blocat / neautorizat',
            ...(isDev && { debug: debugInfo })
          },
          { status: anafStatus }
        );
      }
      
      if (anafStatus === 404) {
        // 404 de la ANAF înseamnă endpoint greșit sau firma nu există
        // Dar dacă am ajuns aici, înseamnă că endpoint-ul a răspuns (nu HTML)
        // Deci este posibil să fie "nu găsește firma", nu "endpoint greșit"
        // Verificăm în body dacă este JSON valid sau eroare
        console.error('[ANAF API] ⚠️ ANAF returned 404');
        debugInfo.error = 'ANAF returned 404';
        
        // Dacă body-ul nu este JSON, este probabil endpoint greșit
        try {
          JSON.parse(anafBodyText);
          // Este JSON valid, probabil "nu găsește firma"
          return NextResponse.json(
            { 
              error: 'Firma nu a fost găsită',
              ...(isDev && { debug: debugInfo })
            },
            { status: 404 }
          );
        } catch {
          // Nu este JSON, probabil endpoint greșit
          return NextResponse.json(
            { 
              error: 'Serviciu ANAF indisponibil (endpoint not found)',
              ...(isDev && { debug: debugInfo })
            },
            { status: 503 }
          );
        }
      }
      
      if (anafStatus === 429) {
        return NextResponse.json(
          { 
            error: 'Rate limit - prea multe cereri către ANAF',
            ...(isDev && { debug: debugInfo })
          },
          { status: 429 }
        );
      }
      
      // 5xx - serviciu indisponibil
      if (anafStatus >= 500) {
        console.error('[ANAF API] ⚠️ ANAF server error');
        return NextResponse.json(
          { 
            error: 'Serviciu ANAF indisponibil',
            ...(isDev && { debug: debugInfo })
          },
          { status: 503 }
        );
      }
      
      // Altă eroare 4xx
      return NextResponse.json(
        { 
          error: `Eroare serviciu ANAF (${anafStatus}). Te rugăm să încerci din nou.`,
          ...(isDev && { debug: debugInfo })
        },
        { status: 503 }
      );
    }

    const contentType = anafResponse.headers.get('content-type');
    console.log('[ANAF API] 📥 Content-Type:', contentType);
    debugInfo.contentType = contentType || 'unknown';
    
    // ANAF poate returna și XML sau alte formate - încearcă să parseze orice
    if (!contentType || (!contentType.includes('application/json') && !contentType.includes('text/'))) {
      console.warn('[ANAF API] ⚠️ Unexpected content-type:', contentType, '- attempting to parse anyway');
    }

    // Parse JSON din text-ul deja citit
    // ANAF returnează un ARRAY direct, nu un obiect
    // Format: [{ found: [{ date_generale: {...} }], not_found: [...] }]
    let anafResponseArray: Array<any>;
    try {
      let rawData: any;
      
      // Verifică dacă este HTML (404 sau alte erori HTML de la ANAF)
      if (anafBodyText.trim().startsWith('<!') || anafBodyText.trim().startsWith('<html') || anafBodyText.includes('<title>404')) {
        console.error('[ANAF API] ❌ Response is HTML, not JSON');
        console.error('[ANAF API] HTML Response (first 500 chars):', anafBodyText.substring(0, 500));
        debugInfo.error = 'ANAF returned HTML instead of JSON (endpoint may not exist)';
        debugInfo.htmlResponse = anafBodyText.substring(0, 500);
        
        // Dacă status-ul este 404, mesaj specific
        if (anafStatus === 404) {
          return NextResponse.json(
            { 
              error: 'Serviciu ANAF indisponibil - endpoint-ul nu mai există la acest URL. Verifică documentația ANAF sau configurează ANAF_API_URL.',
              ...(isDev && { 
                debug: {
                  ...debugInfo,
                  suggestion: 'Setează ANAF_API_URL în .env.local sau folosește MOCK_COMPANY_LOOKUP=1 pentru testare'
                }
              })
            },
            { status: 503 }
          );
        }
        
        return NextResponse.json(
          { 
            error: 'Răspuns invalid de la serviciul ANAF (HTML în loc de JSON)',
            ...(isDev && { debug: debugInfo })
          },
          { status: 500 }
        );
      }
      
      // Parse JSON din text-ul deja citit
      try {
        rawData = JSON.parse(anafBodyText);
        console.log('[ANAF API] ✅ Successfully parsed JSON response');
      } catch (jsonError: any) {
        console.error('[ANAF API] ❌ JSON parse failed:', jsonError.message);
        console.error('[ANAF API] Response text (first 2000 chars):', anafBodyText.substring(0, 2000));
        debugInfo.parseError = jsonError.message;
        
        return NextResponse.json(
          { 
            error: 'Răspuns invalid de la serviciul ANAF (nu este JSON valid)',
            ...(isDev && { debug: debugInfo })
          },
          { status: 500 }
        );
      }
      
      console.log('[ANAF API] 📦 Raw response from ANAF:', JSON.stringify(rawData, null, 2));
      console.log('[ANAF API] 📦 Response type:', typeof rawData, 'Is array:', Array.isArray(rawData));
      debugInfo.anafResponseType = typeof rawData;
      debugInfo.anafResponseIsArray = Array.isArray(rawData);
      
      // ANAF RETURNEAZĂ ÎNTOTDEAUNA UN ARRAY
      if (!Array.isArray(rawData)) {
        console.error('[ANAF API] ❌ Expected array but got:', typeof rawData);
        // Poate fi un obiect cu found/not_found - încercăm să-l convertim
        if (rawData && typeof rawData === 'object') {
          console.log('[ANAF API] 🔄 Converting object to array format');
          rawData = [rawData];
        } else {
          debugInfo.error = 'ANAF response is not an array or object';
          return NextResponse.json(
            { 
              error: 'Răspuns invalid de la serviciul ANAF (nu este array)',
              ...(isDev && { debug: debugInfo })
            },
            { status: 500 }
          );
        }
      }

      anafResponseArray = rawData;
      console.log('[ANAF API] 📦 Response is array with', anafResponseArray.length, 'element(s)');
      debugInfo.anafArrayLength = anafResponseArray.length;

      // Dacă array-ul este gol, firma nu a fost găsită
      if (anafResponseArray.length === 0) {
        console.log('[ANAF API] ❌ Empty array - firma nu a fost găsită');
        debugInfo.error = 'ANAF returned empty array';
        return NextResponse.json(
          { 
            error: 'Firma nu a fost găsită',
            ...(isDev && { debug: debugInfo })
          },
          { status: 404 }
        );
      }

      // Ia primul element din array (ANAF returnează un singur element pentru un singur CUI)
      const firstResponseItem = anafResponseArray[0];
      console.log('[ANAF API] 📦 First item keys:', Object.keys(firstResponseItem || {}));
      console.log('[ANAF API] 📦 First item:', JSON.stringify(firstResponseItem, null, 2));
      debugInfo.firstItemKeys = Object.keys(firstResponseItem || {});

      // Verifică dacă firma a fost găsită în not_found (v7/v8) sau notFound (v9)
      const notFoundArray = firstResponseItem.not_found || firstResponseItem.notFound || [];
      if (Array.isArray(notFoundArray) && notFoundArray.length > 0) {
        const notFoundCui = notFoundArray.find((item: any) => {
          const itemCui = typeof item === 'string' ? item : (item.cui || item.CUI || '');
          return itemCui === cuiNormalized || String(itemCui) === cuiNormalized;
        });
        if (notFoundCui) {
          console.log('[ANAF API] ❌ CUI found in notFound array:', cuiNormalized);
          debugInfo.error = 'CUI found in notFound array';
          return NextResponse.json(
            { 
              error: 'Firma nu a fost găsită',
              ...(isDev && { debug: debugInfo })
            },
            { status: 404 }
          );
        }
      }

      // Verifică dacă există date găsite (found array)
      if (!firstResponseItem.found || !Array.isArray(firstResponseItem.found) || firstResponseItem.found.length === 0) {
        console.log('[ANAF API] ❌ No found array or empty found array');
        debugInfo.error = 'No found array or empty found array';
        return NextResponse.json(
          { 
            error: 'Firma nu a fost găsită',
            ...(isDev && { debug: debugInfo })
          },
          { status: 404 }
        );
      }

      // Extrage datele din primul element found
      const foundItem = firstResponseItem.found[0];
      console.log('[ANAF API] ✅ Found item keys:', Object.keys(foundItem || {}));
      console.log('[ANAF API] ✅ Found item:', JSON.stringify(foundItem, null, 2));
      debugInfo.foundItemKeys = Object.keys(foundItem || {});

      // Extrage date_generale din found item
      const dateGenerale = foundItem.date_generale;
      if (!dateGenerale) {
        console.log('[ANAF API] ⚠️ No date_generale in found item, trying foundItem directly');
        // Încearcă să folosească foundItem direct dacă are câmpurile necesare
        if (foundItem.cui || foundItem.denumire) {
          console.log('[ANAF API] ✅ Using foundItem directly as date_generale');
          const companyData = extractCompanyData(foundItem as ANAFDateGenerale, cuiNormalized);
          if (!companyData) {
            debugInfo.error = 'Failed to extract company data from foundItem';
            return NextResponse.json(
              { 
                error: 'Firma nu a fost găsită sau datele nu sunt complete',
                ...(isDev && { debug: debugInfo })
              },
              { status: 404 }
            );
          }
          return NextResponse.json({
            ...companyData,
            ...(isDev && { debug: debugInfo })
          });
        }
        debugInfo.error = 'No date_generale and foundItem missing required fields';
        return NextResponse.json(
          { 
            error: 'Firma nu a fost găsită sau datele nu sunt complete',
            ...(isDev && { debug: debugInfo })
          },
          { status: 404 }
        );
      }

      console.log('[ANAF API] ✅ Date generale keys:', Object.keys(dateGenerale));
      console.log('[ANAF API] ✅ Date generale:', JSON.stringify(dateGenerale, null, 2));
      debugInfo.dateGeneraleKeys = Object.keys(dateGenerale);

      // Adaugă datele din adresa_sediu_social la dateGenerale pentru mapping mai bun (v9)
      const adresaSediuSocial = foundItem.adresa_sediu_social || {};
      if (adresaSediuSocial && Object.keys(adresaSediuSocial).length > 0) {
        console.log('[ANAF API] ✅ Found adresa_sediu_social, enriching dateGenerale');
        // Adaugă câmpurile din adresa_sediu_social la dateGenerale pentru ușurința mapping-ului
        (dateGenerale as any).judet_sediu = adresaSediuSocial.ddenumire_Judet || adresaSediuSocial.sdenumire_Judet;
        (dateGenerale as any).localitate_sediu = adresaSediuSocial.ddenumire_Localitate || adresaSediuSocial.sdenumire_Localitate;
      }

      // Mapează datele către formatul nostru standardizat
      const companyData = extractCompanyData(dateGenerale, cuiNormalized);
      
      if (!companyData) {
        debugInfo.error = 'Failed to extract company data';
        return NextResponse.json(
          { 
            error: 'Firma nu a fost găsită sau datele nu sunt complete',
            ...(isDev && { debug: debugInfo })
          },
          { status: 404 }
        );
      }
      
      // Adaugă debug info la răspuns dacă e development
      return NextResponse.json({
        ...companyData,
        ...(isDev && { debug: debugInfo })
      });

    } catch (parseError: any) {
      console.error('[ANAF API] ❌ JSON parse error:', parseError);
      console.error('[ANAF API] Parse error name:', parseError.name);
      console.error('[ANAF API] Parse error message:', parseError.message);
      debugInfo.parseError = {
        name: parseError.name,
        message: parseError.message
      };
      return NextResponse.json(
        { 
          error: 'Răspuns invalid de la serviciul ANAF',
          ...(isDev && { debug: debugInfo })
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════');
    console.error('[ANAF API] ❌ CRITICAL ERROR:', error);
    console.error('[ANAF API] Error name:', error.name);
    console.error('[ANAF API] Error message:', error.message);
    console.error('[ANAF API] Error stack:', error.stack);
    console.error('[ANAF API] Error code:', error.code);
    console.error('═══════════════════════════════════════════════════════');
    
    const isDev = process.env.NODE_ENV !== 'production';
    const debugInfo: any = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 1000)
      }
    };
    
    // Dacă eroarea este de la fetch (network error, timeout, etc.)
    if (error.message?.includes('fetch') || 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('network') ||
        error.message?.includes('timeout')) {
      return NextResponse.json(
        { 
          error: 'Eroare de conexiune cu serviciul ANAF. Te rugăm să încerci din nou.',
          ...(isDev && { debug: debugInfo })
        },
        { status: 503 }
      );
    }

    // Pentru alte erori, returnăm 500 cu mesaj generic
    return NextResponse.json(
      { 
        error: `Eroare la procesarea cererii: ${error.message || 'Eroare necunoscută'}`,
        ...(isDev && { debug: debugInfo })
      },
      { status: 500 }
    );
  }
}

