/**
 * API Route - Get HeyGen Avatars and Voices
 * GET /api/heygen/avatars
 * Returnează lista de avatare și voci disponibile de la HeyGen
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    if (!process.env.HEYGEN_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'HEYGEN_API_KEY is not configured',
        },
        { status: 500 }
      );
    }

    // Get avatars
    const avatarsResponse = await fetch('https://api.heygen.com/v2/avatars', {
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!avatarsResponse.ok) {
      const errorText = await avatarsResponse.text();
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch avatars',
          message: `HeyGen API error: ${avatarsResponse.status} - ${errorText}`,
        },
        { status: avatarsResponse.status }
      );
    }

    const avatarsData = await avatarsResponse.json();

    // Get voices
    const voicesResponse = await fetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!voicesResponse.ok) {
      const errorText = await voicesResponse.text();
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch voices',
          message: `HeyGen API error: ${voicesResponse.status} - ${errorText}`,
          avatars: avatarsData,
        },
        { status: voicesResponse.status }
      );
    }

    const voicesData = await voicesResponse.json();

    return NextResponse.json({
      success: true,
      avatars: avatarsData,
      voices: voicesData,
    });
  } catch (error: any) {
    console.error('Error fetching HeyGen avatars/voices:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch HeyGen data',
      },
      { status: 500 }
    );
  }
}


