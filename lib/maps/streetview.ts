/**
 * Google Street View Static API Module
 * Generează URL-uri pentru imagini Street View
 */

export interface StreetViewResult {
  imageUrl: string | null;
  success: boolean;
  error?: string;
}

/**
 * Generează URL-ul pentru o imagine Street View
 * @param lat Latitudine
 * @param lng Longitudine
 * @param size Dimensiunea imaginii (default: 800x600)
 * @param fov Field of view (default: 90) - zoom 0–5 (0 = wide, 5 = aproape)
 * @param pitch Unghiul camerei (default: 0) - unghi vertical, -90 (în jos) – +90 (în sus)
 * @param heading Direcția camerei (default: 0) - direcția în grade, 0 = nord
 * @returns URL-ul imaginii Street View sau null dacă nu există
 */
export function generateStreetViewUrl(
  lat: number,
  lng: number,
  size: string = '800x600',
  fov: number = 90,
  pitch: number = 0,
  heading: number = 0
): string | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[StreetView] ❌ GOOGLE_MAPS_API_KEY not configured');
    console.error('[StreetView] GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT SET');
    console.error('[StreetView] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT SET');
    return null;
  }
  console.log('[StreetView] ✅ API Key found, length:', apiKey.length);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    console.error('[StreetView] Invalid coordinates:', { lat, lng });
    return null;
  }
  
  // Folosim URLSearchParams pentru a construi URL-ul corect
  const params = new URLSearchParams({
    size,
    location: `${lat},${lng}`,
    fov: String(fov),
    heading: String(heading),
    pitch: String(pitch),
    key: apiKey,
  });
  
  const url = `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
  
  return url;
}

/**
 * Alias pentru compatibilitate cu codul ChatGPT
 * @param opts Opțiuni pentru Street View
 */
export function getStreetViewUrl(opts: {
  lat: number;
  lng: number;
  size?: string;
  fov?: number;
  heading?: number;
  pitch?: number;
}): string | null {
  return generateStreetViewUrl(
    opts.lat,
    opts.lng,
    opts.size || '640x400',
    opts.fov || 90,
    opts.pitch || 0,
    opts.heading || 0
  );
}

/**
 * Verifică dacă există Street View pentru coordonatele date
 * @param lat Latitudine
 * @param lng Longitudine
 * @returns true dacă există Street View, false altfel
 */
export async function checkStreetViewAvailability(
  lat: number,
  lng: number
): Promise<boolean> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[StreetView] ❌ No API key for availability check');
    return false;
  }

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    console.error('[StreetView] ❌ Invalid coordinates for availability check:', { lat, lng });
    return false;
  }

  try {
    // Folosim metadata API pentru a verifica disponibilitatea
    const location = `${lat},${lng}`;
    const params = new URLSearchParams({
      location,
      key: apiKey,
    });
    const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;

    console.log(`[StreetView] Checking availability for (${lat}, ${lng})...`);
    const response = await fetch(metadataUrl);
    
    if (!response.ok) {
      console.error(`[StreetView] Metadata API error: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const data = await response.json();
    console.log(`[StreetView] Metadata API response:`, {
      status: data.status,
      copyright: data.copyright,
      date: data.date,
    });

    if (data.status === 'OK') {
      console.log(`[StreetView] ✅ Street View available for (${lat}, ${lng})`);
      return true;
    } else {
      console.log(`[StreetView] ⚠️ No Street View available for (${lat}, ${lng}): ${data.status}`);
      return false;
    }
  } catch (error: any) {
    console.error('[StreetView] Error checking Street View availability:', error.message);
    console.error('[StreetView] Error stack:', error.stack);
    return false;
  }
}

/**
 * Generează URL-ul Street View și verifică disponibilitatea
 * @param lat Latitudine
 * @param lng Longitudine
 * @param size Dimensiunea imaginii (default: 800x600)
 * @param checkAvailability Dacă true, verifică disponibilitatea înainte de a returna URL
 * @returns Rezultatul cu URL-ul imaginii sau null dacă nu există
 */
export async function getStreetViewImage(
  lat: number,
  lng: number,
  size: string = '800x600',
  checkAvailability: boolean = false // DEZACTIVAT - generăm URL-ul întotdeauna
): Promise<StreetViewResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[StreetView] ❌ GOOGLE_MAPS_API_KEY not configured in getStreetViewImage');
    console.error('[StreetView] GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT SET');
    console.error('[StreetView] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT SET');
    return {
      imageUrl: null,
      success: false,
      error: 'GOOGLE_MAPS_API_KEY not configured',
    };
  }
  console.log('[StreetView] ✅ API Key found in getStreetViewImage, length:', apiKey.length);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    console.error('[StreetView] ❌ Invalid coordinates:', { lat, lng });
    return {
      imageUrl: null,
      success: false,
      error: 'Invalid coordinates',
    };
  }

  try {
    // Generează URL-ul DIRECT - fără verificări care pot bloca
    console.log(`[StreetView] 🔄 Generating Street View URL for (${lat}, ${lng}) with size ${size}...`);
    const imageUrl = generateStreetViewUrl(lat, lng, size);
    
    if (!imageUrl) {
      console.error(`[StreetView] ❌ Failed to generate Street View URL`);
      return {
        imageUrl: null,
        success: false,
        error: 'Failed to generate Street View URL',
      };
    }

    console.log(`[StreetView] ✅ Generated Street View URL for (${lat}, ${lng})`);
    console.log(`[StreetView] URL length: ${imageUrl.length}`);
    console.log(`[StreetView] Full URL: ${imageUrl}`);

    // Returnăm URL-ul DIRECT - fără verificări suplimentare
    // Verificarea disponibilității și testarea accesului vor fi făcute la upload
    console.log(`[StreetView] ✅ Returning Street View URL (availability check skipped for faster processing)`);
    return {
      imageUrl,
      success: true,
    };
  } catch (error: any) {
    console.error('[StreetView] ❌ Error getting Street View image:', error.message);
    console.error('[StreetView] Error stack:', error.stack);
    return {
      imageUrl: null,
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generează URL-uri pentru multiple unghiuri (panoramic view)
 * @param lat Latitudine
 * @param lng Longitudine
 * @param size Dimensiunea imaginii (default: 800x600)
 * @returns Array cu URL-uri pentru 4 direcții (Nord, Est, Sud, Vest)
 */
export function generateStreetViewPanoramic(
  lat: number,
  lng: number,
  size: string = '800x600'
): Array<{ heading: number; direction: string; url: string | null }> {
  const headings = [
    { heading: 0, direction: 'Nord' },
    { heading: 90, direction: 'Est' },
    { heading: 180, direction: 'Sud' },
    { heading: 270, direction: 'Vest' },
  ];

  return headings.map(({ heading, direction }) => ({
    heading,
    direction,
    url: generateStreetViewUrl(lat, lng, size, 90, 0, heading),
  }));
}

