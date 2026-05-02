/**
 * API Route pentru reverse geocoding (coordonate -> oraș)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
      return NextResponse.json(
        { success: false, error: 'Lipsesc coordonatele (lat, lng)' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Google Maps API key not configured' },
        { status: 500 }
      );
    }

    // Reverse geocode using Google Maps API
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=ro&region=ro`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      
      // Extract city from address components
      let city = null;
      let region = null;
      let country = null;

      for (const component of result.address_components) {
        if (component.types.includes('locality') || component.types.includes('administrative_area_level_2')) {
          city = component.long_name;
        }
        if (component.types.includes('administrative_area_level_1')) {
          region = component.long_name;
        }
        if (component.types.includes('country')) {
          country = component.long_name;
        }
      }

      return NextResponse.json({
        success: true,
        city: city,
        region: region,
        country: country,
        formattedAddress: result.formatted_address,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Nu s-a putut determina locația',
    });
  } catch (error: any) {
    console.error('Error in reverse geocode API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Eroare la reverse geocoding',
      },
      { status: 500 }
    );
  }
}

































