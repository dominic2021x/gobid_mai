import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

// Cache pentru rate-uri (în memorie, se resetează la restart)
let cachedRates: {
  robor3m: number;
  ircc: number;
  lastUpdated: string;
} | null = null;

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 ore

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Dacă avem cache valid și nu forțăm refresh, returnăm cache-ul
    if (!forceRefresh && cachedRates) {
      const cacheAge = Date.now() - new Date(cachedRates.lastUpdated).getTime();
      if (cacheAge < CACHE_DURATION) {
        return NextResponse.json(cachedRates);
      }
    }

    // Încearcă să obțină rate-urile de la BNR
    // Pentru moment, folosim valori default rezonabile
    // În viitor, poți integra cu API-ul BNR real
    const defaultRates = {
      robor3m: 5.5, // ROBOR 3M default
      ircc: 4.5, // IRCC default
      lastUpdated: new Date().toISOString(),
    };

    // Cache rate-urile
    cachedRates = defaultRates;

    return NextResponse.json(defaultRates);
  } catch (error: any) {
    console.error("Error fetching BNR rates:", error);
    
    // Dacă avem cache, returnăm cache-ul chiar dacă a apărut o eroare
    if (cachedRates) {
      return NextResponse.json(cachedRates);
    }

    // Dacă nu avem cache, returnăm valori default
    return NextResponse.json(
      {
        robor3m: 5.5,
        ircc: 4.5,
        lastUpdated: new Date().toISOString(),
        error: "Nu s-au putut încărca rate-urile BNR. Se folosesc valori default.",
      },
      { status: 200 } // Returnăm 200 pentru a nu cauza erori în frontend
    );
  }
}




















































