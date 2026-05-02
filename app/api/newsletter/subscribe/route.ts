import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// POST - Subscribe to newsletter and generate token code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'Adresă de email validă este obligatorie' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Database not configured' },
        { status: 500 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Generate token code (format: TOKEN5-XXXXXXXX)
    const generateTokenCode = (): string => {
      const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
      return `TOKEN5-${randomPart}`;
    };

    const tokenCode = generateTokenCode();

    // Check if subscriber already exists
    const { data: existing } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, status, token_code')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let finalTokenCode = tokenCode;
    let shouldSendEmail = true;

    if (existing) {
      finalTokenCode = existing.token_code || tokenCode;
      // Update existing subscriber to active if unsubscribed
      if (existing.status === 'unsubscribed') {
        const { error: updateError } = await supabaseAdmin
          .from('newsletter_subscribers')
          .update({
            status: 'active',
            subscribed_at: new Date().toISOString(),
            name: name?.trim() || null,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('[Newsletter API] Error updating subscriber:', updateError);
          return NextResponse.json(
            { success: false, message: 'Eroare la reactivare abonare' },
            { status: 500 }
          );
        }
      } else {
        // Already subscribed - don't send email again
        shouldSendEmail = false;
      }
    } else {
      // Create new subscriber
      const { data: newSubscriber, error: insertError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .insert({
          email: normalizedEmail,
          name: name?.trim() || null,
          status: 'active',
          token_code: finalTokenCode,
          tokens: 5,
          token_code_used: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Newsletter API] Error inserting subscriber:', insertError);
        return NextResponse.json(
          { success: false, message: insertError.message || 'Eroare la abonare' },
          { status: 500 }
        );
      }
    }

    // Send email with token code if this is a new subscription
    if (shouldSendEmail) {
      try {
        // Get Resend config
        const apiKey = process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '';
        const fromEmail = process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@gobid.ro';

        if (!apiKey) {
          console.warn('[Newsletter API] Resend API key not configured, skipping email send');
        } else {
          // Get base URL for logo
          let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
          if (!baseUrl && process.env.VERCEL_URL) {
            baseUrl = `https://${process.env.VERCEL_URL}`;
          }
          if (!baseUrl) {
            baseUrl = process.env.NODE_ENV === 'production' ? 'https://gobid.ro' : 'http://localhost:3000';
          }
          const logoUrl = `${baseUrl}/logo_negru.png`;

          // Email template
          const emailHtml = `
            <!DOCTYPE html>
            <html lang="ro">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cod Tokeni - GoBid Newsletter</title>
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
                              Bine ai venit la Newsletter GoBid!
                            </h1>
                            
                            <p style="margin: 0 0 40px 0; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
                              ${name ? `Salut ${name},` : 'Salut,'}<br><br>
                              Mulțumim că te-ai abonat la newsletter-ul nostru! Pentru că te-ai abonat, primești <strong>5 tokeni cadou</strong>.
                            </p>
                            
                            <!-- Code -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                              <tr>
                                <td align="center" style="padding: 0 0 40px 0;">
                                  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; display: inline-block;">
                                    <div style="font-size: 32px; font-weight: 600; letter-spacing: 4px; color: #111827; font-family: 'SF Mono', 'Monaco', 'Courier New', monospace; text-align: center; line-height: 1;">
                                      ${finalTokenCode}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-align: center;">
                              Folosește acest cod în secțiunea "Tokens" din Dashboard pentru a obține 5 tokeni.
                            </p>
                            
                            <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                              Vei primi noutăți despre licitații exclusive și oferte speciale.
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
Bine ai venit la Newsletter GoBid!

Mulțumim că te-ai abonat la newsletter-ul nostru! Pentru că te-ai abonat, primești 5 tokeni cadou.

Codul tău: ${finalTokenCode}

Folosește acest cod în secțiunea "Tokens" din Dashboard pentru a obține 5 tokeni.

Vei primi noutăți despre licitații exclusive și oferte speciale.
          `;

          // Send email via Resend API
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: normalizedEmail,
              subject: 'Bine ai venit la Newsletter GoBid - 5 Tokeni Cadou!',
              html: emailHtml,
              text: emailText,
            }),
          });

          if (!emailResponse.ok) {
            console.error('[Newsletter API] Error sending email:', await emailResponse.text());
            // Don't fail the subscription if email fails
          }
        }
      } catch (emailError: any) {
        console.error('[Newsletter API] Error sending email:', emailError);
        // Don't fail the subscription if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: shouldSendEmail 
        ? 'Te-ai abonat cu succes! Verifică email-ul pentru codul tău de 5 tokeni.' 
        : 'Ești deja abonat!',
      tokens: 5
    });
  } catch (error: any) {
    console.error('[Newsletter API] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Eroare la abonare' },
      { status: 500 }
    );
  }
}
