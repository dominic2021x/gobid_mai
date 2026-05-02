import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Google Maps Geocoding API Module
 * Transformă adrese în coordonate GPS (latitudine și longitudine)
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
  addressComponents?: Array<{
    longName: string;
    shortName: string;
    types: string[];
  }>;
  success: boolean;
  error?: string;
}

const toAddressComponent = (longName: string, types: string[], shortName = longName) => ({
  longName,
  shortName,
  types,
});

async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<GeocodeResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1&accept-language=ro`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GoBid/1.0 location autofill',
      },
    });

    if (!response.ok) {
      return {
        lat,
        lng,
        formattedAddress: '',
        success: false,
        error: `Nominatim HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const address = data?.address ?? {};
    const county = String(address.county || address.state || address.region || '').trim();
    const city = String(address.city || address.town || address.municipality || address.commune || '').trim();
    const village = String(address.village || address.suburb || address.neighbourhood || address.city_district || address.quarter || '').trim();
    const formattedAddress = String(data?.display_name || [village, city, county, 'România'].filter(Boolean).join(', '));
    const addressComponents = [
      county ? toAddressComponent(county, ['administrative_area_level_1']) : null,
      city ? toAddressComponent(city, ['locality']) : null,
      village ? toAddressComponent(village, ['sublocality', 'sublocality_level_1']) : null,
    ].filter(Boolean) as NonNullable<GeocodeResult['addressComponents']>;

    if (!county && !city && !village) {
      return {
        lat,
        lng,
        formattedAddress,
        success: false,
        error: 'Nominatim did not return an approximate locality',
      };
    }

    return {
      lat,
      lng,
      formattedAddress,
      addressComponents,
      success: true,
    };
  } catch (error: any) {
    return {
      lat,
      lng,
      formattedAddress: '',
      success: false,
      error: error?.message || 'Nominatim reverse geocoding failed',
    };
  }
}

async function geocodeWithNominatim(address: string): Promise<GeocodeResult> {
  const query = address.trim();
  if (!query) {
    return {
      lat: 0,
      lng: 0,
      formattedAddress: address,
      success: false,
      error: 'Empty address',
    };
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&accept-language=ro&countrycodes=ro`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GoBid/1.0 location geocoding',
      },
    });

    if (!response.ok) {
      return {
        lat: 0,
        lng: 0,
        formattedAddress: query,
        success: false,
        error: `Nominatim HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : null;
    const lat = Number(result?.lat);
    const lng = Number(result?.lon);
    if (!result || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        lat: 0,
        lng: 0,
        formattedAddress: query,
        success: false,
        error: 'Nominatim ZERO_RESULTS',
      };
    }

    const a = result.address ?? {};
    const county = String(a.county || a.state || a.region || '').trim();
    const city = String(a.city || a.town || a.municipality || a.commune || a.village || '').trim();
    const village = String(a.village || a.suburb || a.neighbourhood || a.city_district || a.quarter || '').trim();
    const addressComponents = [
      county ? toAddressComponent(county, ['administrative_area_level_1']) : null,
      city ? toAddressComponent(city, ['locality']) : null,
      village ? toAddressComponent(village, ['sublocality', 'sublocality_level_1']) : null,
    ].filter(Boolean) as NonNullable<GeocodeResult['addressComponents']>;

    return {
      lat,
      lng,
      formattedAddress: String(result.display_name || query),
      addressComponents,
      success: true,
    };
  } catch (error: any) {
    return {
      lat: 0,
      lng: 0,
      formattedAddress: query,
      success: false,
      error: error?.message || 'Nominatim geocoding failed',
    };
  }
}

/**
 * Normalizează adresa folosind GPT-4o înainte de geocodare
 * Folosim acest pas pentru a îmbunătăți calitatea adreselor incomplete sau ambigue
 */
export async function normalizeAddressWithGPT(address: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Geocode] OPENAI_API_KEY not configured, skipping normalization');
    return address;
  }

  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({
    apiKey: OPENAI_SDK_API_KEY,
  });

  const prompt = `Ești un expert în normalizarea adreselor din România.
Sarcina ta este să transformi următoarea adresă într-un format standard complet, gata pentru geocodare.

Adresa primită: "${address}"

Returnează DOAR adresa normalizată, fără text suplimentar, în formatul:
"[Strada] [Număr], [Localitate], [Județ], România"

Exemple:
- "București, Sector 1" → "București, Sector 1, București, România"
- "Str. Mihai Eminescu, Cluj" → "Strada Mihai Eminescu, Cluj-Napoca, Cluj, România"
- "Timișoara, Bulevardul Revoluției din 1989" → "Bulevardul Revoluției din 1989, Timișoara, Timiș, România"

Dacă adresa este deja completă și clară, returnează-o așa cum este.
Dacă nu poți normaliza adresa, returnează adresa originală.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Folosim mini pentru costuri mai mici
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în normalizarea adreselor din România. Returnezi doar adresa normalizată, fără explicații.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const normalizedAddress = completion.choices[0]?.message?.content?.trim();
    if (normalizedAddress && normalizedAddress.length > 0) {
      console.log(`[Geocode] Normalized address: "${address}" → "${normalizedAddress}"`);
      return normalizedAddress;
    }
  } catch (error: any) {
    console.error('[Geocode] Error normalizing address with GPT:', error.message);
  }

  return address;
}

/**
 * Geocodează o adresă folosind Google Maps Geocoding API
 * @param address Adresa de geocodat
 * @param normalize Dacă true, normalizează adresa cu GPT înainte de geocodare
 * @returns Coordonatele GPS și adresa formatată
 * 
 * Compatibil cu codul ChatGPT - returnează GeocodeResult cu success/error
 */
export async function geocodeAddress(
  address: string,
  normalize: boolean = true
): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return geocodeWithNominatim(address);
  }
  if (process.env.DEBUG_GEOCODE === '1') {
    console.log('[Geocode] ✅ API Key found, length:', apiKey.length);
  }

  if (!address || address.trim().length === 0) {
    return {
      lat: 0,
      lng: 0,
      formattedAddress: address,
      success: false,
      error: 'Empty address',
    };
  }

  try {
    // Pasul 1: Normalizează adresa dacă este necesar
    let addressToGeocode = address.trim();
    if (normalize) {
      addressToGeocode = await normalizeAddressWithGPT(addressToGeocode);
    }

    // Pasul 2: Geocodează adresa folosind Google Maps Geocoding API
    const encodedAddress = encodeURIComponent(addressToGeocode);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}&region=ro&language=ro`;

    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;

      if (process.env.DEBUG_GEOCODE === '1') {
        console.log(`[Geocode] Successfully geocoded: "${addressToGeocode}" → (${location.lat}, ${location.lng})`);
      }

      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        addressComponents: Array.isArray(result.address_components)
          ? result.address_components.map((component: any) => ({
              longName: String(component.long_name ?? ''),
              shortName: String(component.short_name ?? ''),
              types: Array.isArray(component.types) ? component.types.map(String) : [],
            }))
          : undefined,
        success: true,
      };
    } else if (data.status === 'ZERO_RESULTS') {
      console.warn(`[Geocode] No results found for address: "${addressToGeocode}"`);
      const fallback = await geocodeWithNominatim(addressToGeocode);
      if (fallback.success) return fallback;
      return {
        lat: 0,
        lng: 0,
        formattedAddress: addressToGeocode,
        success: false,
        error: fallback.error || 'ZERO_RESULTS - Address not found',
      };
    } else {
      if (data.status !== "REQUEST_DENIED") {
        console.error(`[Geocode] Geocoding error: ${data.status} for address: "${addressToGeocode}"`);
      }
      const fallback = await geocodeWithNominatim(addressToGeocode);
      if (fallback.success) return fallback;
      return {
        lat: 0,
        lng: 0,
        formattedAddress: addressToGeocode,
        success: false,
        error: fallback.error || `Geocoding error: ${data.status}`,
      };
    }
  } catch (error: any) {
    console.error('[Geocode] Error geocoding address:', error.message);
    const fallback = await geocodeWithNominatim(address);
    if (fallback.success) return fallback;
    return {
      lat: 0,
      lng: 0,
      formattedAddress: address,
      success: false,
      error: fallback.error || error.message || 'Unknown error',
    };
  }
}

/**
 * Adresă din coordonate (pentru câmpul „Locație” la folosirea GPS-ului).
 */
export async function reverseGeocodeLatLng(
  lat: number,
  lng: number
): Promise<GeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      lat,
      lng,
      formattedAddress: '',
      success: false,
      error: 'Invalid coordinates',
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return reverseGeocodeWithNominatim(lat, lng);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=ro`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const loc = result.geometry.location;
      return {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        addressComponents: Array.isArray(result.address_components)
          ? result.address_components.map((component: any) => ({
              longName: String(component.long_name ?? ''),
              shortName: String(component.short_name ?? ''),
              types: Array.isArray(component.types) ? component.types.map(String) : [],
            }))
          : undefined,
        success: true,
      };
    }
    const fallback = await reverseGeocodeWithNominatim(lat, lng);
    if (fallback.success) {
      return fallback;
    }
    return {
      lat,
      lng,
      formattedAddress: '',
      success: false,
      error: data.status !== 'OK' ? String(data.status) : fallback.error || 'ZERO_RESULTS',
    };
  } catch (error: any) {
    const fallback = await reverseGeocodeWithNominatim(lat, lng);
    if (fallback.success) {
      return fallback;
    }
    return {
      lat,
      lng,
      formattedAddress: '',
      success: false,
      error: error?.message || 'Reverse geocoding failed',
    };
  }
}

/**
 * Geocodează o adresă completă (județ + localitate + adresa)
 * @param judet Județul
 * @param localitate Localitatea
 * @param adresa Adresa exactă
 * @returns Coordonatele GPS și adresa formatată
 */
export async function geocodeFullAddress(
  judet: string,
  localitate: string,
  adresa?: string | null
): Promise<GeocodeResult> {
  // Construiește adresa completă
  let fullAddress = '';
  if (adresa && adresa.trim().length > 0) {
    fullAddress = `${adresa.trim()}, ${localitate}, ${judet}, România`;
  } else {
    fullAddress = `${localitate}, ${judet}, România`;
  }

  return geocodeAddress(fullAddress, true);
}

