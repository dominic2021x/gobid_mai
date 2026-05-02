/**
 * API Route - Street View Image Generator
 * POST /api/street-view
 * 
 * Primește o adresă și returnează:
 * - Adresa normalizată
 * - Coordonatele GPS
 * - URL-ul imaginii Street View
 */

import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/maps/geocode';
import { getStreetViewImage } from '@/lib/maps/streetview';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const address = body.address as string | undefined;

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return NextResponse.json(
        { error: 'Lipsește câmpul "address" sau este gol' },
        { status: 400 }
      );
    }

    console.log(`[Street View API] Geocoding address: "${address}"`);

    // 1. Geocodare adresă
    const geo = await geocodeAddress(address.trim(), true); // normalize = true

    if (!geo.success) {
      console.error(`[Street View API] Geocoding failed: ${geo.error}`);
      return NextResponse.json(
        { 
          error: 'Nu s-a putut geocoda adresa',
          details: geo.error || 'Unknown error'
        },
        { status: 422 }
      );
    }

    console.log(`[Street View API] Geocoded successfully: (${geo.lat}, ${geo.lng})`);

    // 2. Generează URL Street View
    const streetViewResult = await getStreetViewImage(
      geo.lat,
      geo.lng,
      '640x400', // Dimensiune standard
      true // Verifică disponibilitatea
    );

    if (!streetViewResult.success || !streetViewResult.imageUrl) {
      console.warn(`[Street View API] Street View not available: ${streetViewResult.error}`);
      return NextResponse.json(
        { 
          error: 'Nu s-a putut genera URL-ul Street View sau Street View nu este disponibil pentru această locație',
          details: streetViewResult.error || 'Street View not available',
          // Returnăm totuși coordonatele și adresa normalizată
          addressInput: address,
          addressNormalized: geo.formattedAddress,
          lat: geo.lat,
          lng: geo.lng,
        },
        { status: 422 }
      );
    }

    console.log(`[Street View API] Street View URL generated successfully`);

    // 3. Returnează rezultatul complet
    return NextResponse.json({
      success: true,
      addressInput: address,
      addressNormalized: geo.formattedAddress,
      lat: geo.lat,
      lng: geo.lng,
      placeId: geo.placeId,
      streetViewUrl: streetViewResult.imageUrl,
    });
  } catch (err: any) {
    console.error('[Street View API] Error:', err);
    return NextResponse.json(
      { 
        error: 'Eroare internă',
        details: err?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler pentru testare
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json(
      { 
        error: 'Lipsește parametrul "address"',
        usage: 'GET /api/street-view?address=Strada X nr. Y, Oraș, Județ, România'
      },
      { status: 400 }
    );
  }

  // Folosim același handler POST
  const mockRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });

  return POST(mockRequest);
}



