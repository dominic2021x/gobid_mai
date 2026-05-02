/**
 * API Route pentru obținerea locației utilizatorului pe baza IP-ului
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function isPrivateOrLocalIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  return (
    !value ||
    value === 'unknown' ||
    value === '::1' ||
    value === 'localhost' ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value)
  );
}

function numericOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    // Obține IP-ul clientului
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : 
               request.headers.get('x-real-ip') || 
               'unknown';
    const publicIp = isPrivateOrLocalIp(ip) ? '' : ip;

    // Folosim un serviciu gratuit pentru geolocație bazată pe IP
    // ipapi.co oferă 1000 de request-uri gratuite pe zi
    try {
      const response = await fetch(publicIp ? `https://ipapi.co/${encodeURIComponent(publicIp)}/json/` : 'https://ipapi.co/json/', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.error) {
        // Fallback la alt serviciu
        const fallbackResponse = await fetch(
          publicIp
            ? `http://ip-api.com/json/${encodeURIComponent(publicIp)}?fields=status,message,city,regionName,country,countryCode,lat,lon`
            : 'http://ip-api.com/json/?fields=status,message,city,regionName,country,countryCode,lat,lon',
          { cache: 'no-store' },
        );
        const fallbackData = await fallbackResponse.json();

        if (fallbackData.status === 'success') {
          return NextResponse.json({
            success: true,
            city: fallbackData.city || null,
            region: fallbackData.regionName || null,
            country: fallbackData.country || null,
            countryCode: fallbackData.countryCode || null,
            lat: numericOrNull(fallbackData.lat),
            lng: numericOrNull(fallbackData.lon),
          });
        }
      } else {
        return NextResponse.json({
          success: true,
          city: data.city || null,
          region: data.region || null,
          country: data.country_name || null,
          countryCode: data.country_code || null,
          lat: numericOrNull(data.latitude),
          lng: numericOrNull(data.longitude),
        });
      }
    } catch (apiError) {
      console.error('Error fetching location from IP services:', apiError);
    }

    // Dacă toate serviciile eșuează, returnează null
    return NextResponse.json({
      success: false,
      city: null,
      region: null,
      country: null,
      countryCode: null,
      error: 'Nu s-a putut determina locația',
    });
  } catch (error: any) {
    console.error('Error in location API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Eroare la obținerea locației',
      },
      { status: 500 }
    );
  }
}































