import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Serviciu alternativ pentru căutarea datelor firmei
 * Folosește scraping sau API-uri alternative când ANAF nu este disponibil
 */
async function tryAlternativeCompanyLookup(cui: string): Promise<any | null> {
  try {
    // Opțiunea 1: Încearcă să obțină date de pe site-uri publice
    // Folosim un serviciu care oferă date despre firme
    
    // NOTĂ: Multe site-uri blochează scraping-ul direct din cauza CORS
    // Pentru producție, ar trebui folosit un serviciu API dedicat sau
    // un serviciu de scraping server-side (ex: Puppeteer, Playwright)
    
    // Deocamdată, returnăm null pentru a permite completarea manuală
    // Utilizatorii pot completa datele manual, ceea ce este deja funcțional
    
    // Pentru viitor, poți integra:
    // 1. InfoCUI.ro API (dacă oferă API public)
    // 2. RRF.ro API (dacă oferă API public)
    // 3. Un serviciu de scraping server-side (Puppeteer/Playwright)
    // 4. Un serviciu comercial de date firme
    
    console.log('ℹ️ Alternative lookup not implemented yet - using manual entry');
    return null;
  } catch (error) {
    console.error('❌ Alternative lookup error:', error);
    return null;
  }
}

/**
 * API endpoint pentru căutarea datelor firmei pe baza CUI sau nume
 * Folosește servicii alternative și API-ul ANAF pentru căutarea datelor firmelor din România
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cui, companyName } = body;

    if (!cui && !companyName) {
      return NextResponse.json(
        { success: false, message: 'CUI sau numele firmei este obligatoriu' },
        { status: 400 }
      );
    }

    // Dacă avem CUI, folosim servicii alternative și API-ul ANAF
    if (cui) {
      const cuiClean = cui.replace(/\D/g, ''); // Elimină toate caracterele non-digit
      
      // Încearcă mai întâi serviciul alternativ
      try {
        console.log('🔍 Trying alternative company lookup service...');
        const alternativeResult = await tryAlternativeCompanyLookup(cuiClean);
        if (alternativeResult) {
          console.log('✅ Found company data via alternative service');
          return NextResponse.json({
            success: true,
            data: alternativeResult
          });
        }
      } catch (altError) {
        console.log('⚠️ Alternative service failed, trying ANAF:', altError);
      }
      
      // Dacă serviciul alternativ nu funcționează, încearcă ANAF
      try {
        // API ANAF pentru căutare după CUI
        // URL corect: https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva
        const anafUrl = `https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva`;
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        console.log('🔍 [ANAF] Calling API with:', { cui: cuiClean, data: currentDate, url: anafUrl });
        
        const response = await fetch(anafUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify([{ cui: cuiClean, data: currentDate }]),
        });

        console.log('📡 [ANAF] Response status:', response.status, response.statusText);
        console.log('📡 [ANAF] Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ ANAF API returned error:', response.status, response.statusText);
          console.error('❌ Error response body:', errorText.substring(0, 500));
          
          // Dacă este 404, API-ul ANAF nu este disponibil sau URL-ul este greșit
          if (response.status === 404) {
            console.warn('⚠️ ANAF API returns 404 - service may be unavailable or URL changed');
            // Nu aruncăm eroare, continuăm cu fallback
            throw new Error('ANAF_API_404');
          }
          
          // Continuă cu fallback pentru alte erori
          throw new Error(`ANAF API error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('📡 Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('❌ ANAF API returned non-JSON:', text.substring(0, 500));
          throw new Error('ANAF API returned invalid response');
        }

        const data = await response.json();
        console.log('🔍 [ANAF] Full Response:', JSON.stringify(data, null, 2));
        console.log('🔍 [ANAF] Response type:', typeof data, 'Is array:', Array.isArray(data));
        console.log('🔍 [ANAF] Response keys:', data ? Object.keys(data) : 'null');
        
        // ANAF returnează date în format: { found: [{ date: [...], name: "..." }] }
        // Sau direct array cu obiecte
        let companyData = null;
        
        // Structura ANAF: { cod: 200, message: "SUCCESS", found: [{ date_generale: {...} }] }
        if (data.found && Array.isArray(data.found) && data.found.length > 0) {
          const foundItem = data.found[0];
          // Datele sunt în date_generale, nu în date
          if (foundItem.date_generale) {
            companyData = foundItem.date_generale;
            console.log('✅ Found data in date_generale');
          } else if (foundItem.date && Array.isArray(foundItem.date) && foundItem.date.length > 0) {
            companyData = foundItem.date[0];
            console.log('✅ Found data in date array');
          } else {
            companyData = foundItem;
            console.log('✅ Using foundItem directly');
          }
        } else if (Array.isArray(data) && data.length > 0) {
          // Format: [{ found: [{ date_generale: {...} }] }]
          const firstItem = data[0];
          if (firstItem.found && Array.isArray(firstItem.found) && firstItem.found.length > 0) {
            const foundItem = firstItem.found[0];
            if (foundItem.date_generale) {
              companyData = foundItem.date_generale;
              console.log('✅ Found data in date_generale (array format)');
            } else if (foundItem.date && Array.isArray(foundItem.date) && foundItem.date.length > 0) {
              companyData = foundItem.date[0];
              console.log('✅ Found data in date array (array format)');
            } else {
              companyData = foundItem;
              console.log('✅ Using foundItem directly (array format)');
            }
          }
        } else if (data.not_found && Array.isArray(data.not_found) && data.not_found.length > 0) {
          console.log('❌ CUI found in not_found array');
          companyData = null;
        }
        
        console.log('🎯 Extracted companyData before mapping:', companyData ? JSON.stringify(companyData, null, 2) : 'null');
        
        if (companyData) {
          console.log('✅ Extracted company data:', JSON.stringify(companyData, null, 2));
          console.log('✅ CompanyData keys:', Object.keys(companyData));
          
          // Mapare câmpuri ANAF - verifică toate variantele posibile
          const anafName = companyData.denumire || 
                          companyData.denumire_firma || 
                          companyData.name || 
                          companyData.denumireCompanie || 
                          '';
          const anafCui = companyData.cui || 
                        companyData.cod || 
                        companyData.cif || 
                        cui;
          const anafAddress = companyData.adresa || 
                             companyData.adresa_sediu || 
                             companyData.address || 
                             companyData.adresaCompleta || 
                             '';
          const anafCity = companyData.localitate || 
                         companyData.oras || 
                         companyData.city || 
                         companyData.localitateSediu || 
                         '';
          const anafCounty = companyData.judet || 
                           companyData.judetSediu || 
                           companyData.county || 
                           '';
          const anafRegCom = companyData.nrRegCom || 
                           companyData.numarRegistruComert || 
                           companyData.registrationNumber || 
                           companyData.nr_reg_com || 
                           '';
          
          console.log('Mapped fields:', {
            name: anafName,
            cui: anafCui,
            address: anafAddress,
            city: anafCity,
            county: anafCounty,
            registrationNumber: anafRegCom
          });
          
          // Verifică dacă avem cel puțin un câmp completat (nu doar stringuri goale)
          const hasValidData = (anafName && anafName.trim()) || 
                              (anafCity && anafCity.trim()) || 
                              (anafCounty && anafCounty.trim()) || 
                              (anafAddress && anafAddress.trim());
          
          console.log('🔍 Has valid data check:', {
            hasValidData,
            anafName: anafName?.trim() || '(empty)',
            anafCity: anafCity?.trim() || '(empty)',
            anafCounty: anafCounty?.trim() || '(empty)',
            anafAddress: anafAddress?.trim() || '(empty)'
          });
          
          if (hasValidData) {
            console.log('✅ Returning valid company data');
            return NextResponse.json({
              success: true,
              data: {
                name: anafName,
                cui: anafCui,
                address: anafAddress,
                city: anafCity,
                county: anafCounty,
                country: 'România',
                registrationNumber: anafRegCom,
                phone: '',
                email: '',
              }
            });
          } else {
            console.log('No valid data found in companyData');
          }
        } else {
          console.log('No companyData extracted from ANAF response');
        }
      } catch (anafError: any) {
        console.error('ANAF API Error:', anafError);
        console.error('Error details:', {
          message: anafError.message,
          stack: anafError.stack
        });
        
        // Dacă ANAF nu funcționează, încercă serviciu alternativ sau returnează mesaj
        // Poți adăuga aici integrare cu alt serviciu (ex: RRF.ro, VerificareTVA.ro)
      }
    }

    // Dacă avem doar numele firmei sau ANAF nu a returnat rezultate
    // Returnăm un răspuns cu câmpurile goale pentru completare manuală
    return NextResponse.json({
      success: true,
      data: {
        name: companyName || '',
        cui: cui || '',
        address: '',
        city: '',
        county: '',
        country: 'România',
        registrationNumber: '',
        phone: '',
        email: '',
      },
      message: cui 
        ? 'Completează manual datele firmei.' 
        : 'Completează manual datele firmei.'
    });

  } catch (error: any) {
    console.error('Error in company lookup:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Eroare la căutarea datelor firmei' 
      },
      { status: 500 }
    );
  }
}

