import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * API endpoint to check if Resend is configured
 * Checks environment variables, not localStorage
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '';
    const fromEmail = process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';

    const configured = !!apiKey;

    return NextResponse.json({
      configured,
      hasApiKey: !!apiKey,
      hasFromEmail: !!fromEmail,
    });
  } catch (error: any) {
    console.error('Error checking Resend config:', error);
    return NextResponse.json({
      configured: false,
      hasApiKey: false,
      hasFromEmail: false,
    });
  }
}