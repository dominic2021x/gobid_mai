import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { storeVerificationCode } from '@/lib/verification-codes';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId } = body;

    if (!email || !userId) {
      return NextResponse.json(
        { success: false, message: 'Email și userId sunt obligatorii' },
        { status: 400 }
      );
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Normalize email (trim and lowercase)
    const normalizedEmail = email.trim().toLowerCase();

    // Store code in database
    try {
      await storeVerificationCode(normalizedEmail, code, userId, 15);
      console.log('📧 Verification code stored:', {
        email: normalizedEmail,
        code: code,
        userId: userId,
        timestamp: new Date().toISOString()
      });
    } catch (storeError: any) {
      console.error('Error storing verification code:', storeError);
      // If table doesn't exist, fall back to in-memory storage
      const { storeVerificationCode: storeInMemory } = await import('@/lib/verification-codes');
      storeInMemory(normalizedEmail, code, userId, 15);
      console.log('⚠️ Using in-memory storage as fallback');
    }

    // Get Resend config from multiple sources
    // Priority: 1. resend_config from localStorage (via request body), 2. RESEND_CONFIG env, 3. env vars
    let resendConfig: any = {};
    
    // Try to get config from request body (if sent from client with localStorage config)
    try {
      const bodyConfig = body.config;
      if (bodyConfig && bodyConfig.apiKey) {
        resendConfig = bodyConfig;
      }
    } catch (e) {
      // Ignore
    }
    
    // Fallback to env vars
    if (!resendConfig.apiKey) {
      try {
        const envConfig = JSON.parse(process.env.RESEND_CONFIG || '{}');
        if (envConfig.apiKey) {
          resendConfig = { ...resendConfig, ...envConfig };
        }
      } catch (e) {
        // Ignore
      }
    }
    
    const apiKey = resendConfig.apiKey || process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'Resend API key nu este configurat!' },
        { status: 400 }
      );
    }

    // Get from email - prioritize verified domain email
    // Use verified domain email from config, or default to gobid.ro domain
    // IMPORTANT: Trebuie să folosești un email de la domeniul verificat (ex: noreply@gobid.ro, hello@gobid.ro)
    const fromEmail = resendConfig.fromEmail 
      || process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL 
      || process.env.RESEND_FROM_EMAIL
      || 'noreply@gobid.ro'; // Default - înlocuiește cu email-ul tău verificat

    // Get base URL for logo (automatically uses the same logo as UniversalHeader)
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseUrl) {
      baseUrl = process.env.NODE_ENV === 'production' ? 'https://gobid.ro' : 'http://localhost:3000';
    }
    
    // Logo URL - same as UniversalHeader (automatically updates if logo changes)
    const logoUrl = `${baseUrl}/logo_negru.png`;

    // Send email with code - Modern, clean, professional template
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="ro">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Cod de verificare - GoBid</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff; line-height: 1.6;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
            <tr>
              <td align="center" style="padding: 60px 20px;">
                <!-- Logo -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto 50px;">
                  <tr>
                    <td align="center" style="padding: 0 0 50px 0;">
                      <img src="${logoUrl}" alt="GoBid" style="max-width: 140px; height: auto; display: block;" />
                    </td>
                  </tr>
                </table>
                
                <!-- Main Content -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto;">
                  <tr>
                    <td style="padding: 0;">
                      <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 600; color: #111827; text-align: center; letter-spacing: -0.5px;">
                        Cod de verificare
                      </h1>
                      
                      <p style="margin: 0 0 40px 0; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
                        Salut,<br><br>
                        Codul tău GoBid este <strong style="color: #111827;">${code}</strong>. Folosește-l pentru a-ți confirma contul.
                      </p>
                      
                      <!-- Code -->
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td align="center" style="padding: 0 0 40px 0;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; display: inline-block;">
                              <div style="font-size: 32px; font-weight: 600; letter-spacing: 8px; color: #111827; font-family: 'SF Mono', 'Monaco', 'Courier New', monospace; text-align: center; line-height: 1;">
                                ${code}
                              </div>
                            </div>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #9ca3af; text-align: center;">
                        Acest cod expiră în 15 minute
                      </p>
                      
                      <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                        Dacă nu ai solicitat acest cod, poți ignora acest email.
                      </p>
                    </td>
                  </tr>
                </table>
                
                <!-- Footer -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 60px auto 0;">
                  <tr>
                    <td align="center" style="padding: 40px 0 0 0; border-top: 1px solid #f3f4f6;">
                      <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">
                        © ${new Date().getFullYear()} GoBid. Toate drepturile rezervate.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const emailText = `
Cod de verificare

Codul tău GoBid este:

${code}

Acest cod expiră în 15 minute.

Dacă nu ai solicitat acest cod, te rugăm să ignori acest email.
    `;

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: normalizedEmail,
        subject: 'Cod de verificare - GoBid',
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      return NextResponse.json({
        success: false,
        message: error.message || 'Eroare la trimiterea email-ului',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Cod de verificare trimis cu succes!',
      debug: {
        email: normalizedEmail,
        codeStored: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error sending verification code:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Eroare la trimiterea codului de verificare'
      },
      { status: 500 }
    );
  }
}

