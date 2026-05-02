/**
 * API Route pentru trimiterea email-urilor via Resend
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, html, text, config } = body;

    // Validare input
    if (!to || !subject || !html) {
      return NextResponse.json(
        { success: false, message: 'To, subject și html sunt obligatorii' },
        { status: 400 }
      );
    }

    // Get API key from config or environment
    const apiKey = config?.apiKey || process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '';
    
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'Resend API key nu este configurat!' },
        { status: 400 }
      );
    }

    // Prepare email data
    // Default to noreply@gobid.ro for verified domain
    const emailData: any = {
      from: config?.fromEmail || process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@gobid.ro',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    if (text) {
      emailData.text = text;
    }

    // Add from name if provided
    if (config?.fromName) {
      emailData.from = `${config.fromName} <${emailData.from}>`;
    }

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      return NextResponse.json({
        success: false,
        message: error.message || `HTTP ${response.status}: Eroare la trimiterea email-ului`,
        error: error.message || response.statusText,
      });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Email trimis cu succes!',
      emailId: data.id,
      data: data,
    });
  } catch (error: any) {
    console.error('Error sending email via Resend:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Eroare la trimiterea email-ului'
      },
      { status: 500 }
    );
  }
}
