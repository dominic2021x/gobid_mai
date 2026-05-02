/**
 * Email template pentru resetare parolă
 */

export interface ResetPasswordEmailData {
  resetLink: string;
  userName?: string;
  expiresIn?: string;
  logoUrl?: string; // Optional logo URL - will be auto-generated if not provided
  baseUrl?: string; // Optional base URL for logo - will be auto-generated if not provided
}

/**
 * Generează HTML pentru email-ul de resetare parolă (template modern)
 */
export function generateResetPasswordEmail(data: ResetPasswordEmailData): string {
  let { resetLink, userName = 'Utilizator', expiresIn = '24 de ore', logoUrl, baseUrl } = data;
  
  // CRITICAL: Ensure redirect_to is always https://gobid.ro/auth/reset-password
  // This is a server-side check (runs in Node.js, not browser)
  const productionUrl = 'https://gobid.ro';
  
  try {
    const url = new URL(resetLink);
    const redirectToParam = url.searchParams.get('redirect_to');
    
    if (redirectToParam) {
      let decoded = redirectToParam;
      try {
        decoded = decodeURIComponent(redirectToParam);
        if (decoded.includes('%')) {
          decoded = decodeURIComponent(decoded);
        }
      } catch (e) {
        decoded = redirectToParam;
      }
      
      // Force to production URL if not correct
      const hasWww = decoded.includes('www.gobid.ro');
      const isNotExactPath = !decoded.endsWith('/auth/reset-password-redirect');
      const isJustDomain = decoded === 'https://www.gobid.ro' || decoded === 'https://www.gobid.ro/' || 
                           decoded === 'https://gobid.ro' || decoded === 'https://gobid.ro/';
      
      if (decoded !== `${productionUrl}/auth/reset-password-redirect` ||
          decoded.includes('localhost') ||
          decoded.includes('vercel') ||
          !decoded.includes('gobid.ro') ||
          hasWww ||
          isNotExactPath ||
          isJustDomain) {
        url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
        resetLink = url.toString();
      }
    } else {
      url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
      resetLink = url.toString();
    }
  } catch (e) {
    // If URL parsing fails, try string replacement
    if (resetLink.includes('localhost') || resetLink.includes('vercel')) {
      resetLink = resetLink.replace(/redirect_to=([^&]+)/g, (match: string, value: string): string => {
        try {
        const decoded = decodeURIComponent(value);
        const hasWww = decoded.includes('www.gobid.ro');
        const isNotExactPath = !decoded.endsWith('/auth/reset-password-redirect');
        const isJustDomain = decoded === 'https://www.gobid.ro' || decoded === 'https://www.gobid.ro/' || 
                             decoded === 'https://gobid.ro' || decoded === 'https://gobid.ro/';
        
        if (decoded.includes('localhost') || decoded.includes('vercel') || !decoded.includes('gobid.ro') || 
            hasWww || isNotExactPath || isJustDomain) {
          return `redirect_to=${encodeURIComponent(`${productionUrl}/auth/reset-password-redirect`)}`;
        }
        } catch (e) {
          // If decoding fails, replace anyway
          return `redirect_to=${encodeURIComponent(`${productionUrl}/auth/reset-password`)}`;
        }
        return match;
      });
    }
  }

  // Get base URL for logo if not provided
  let finalBaseUrl = baseUrl;
  if (!finalBaseUrl) {
    if (typeof window !== 'undefined') {
      finalBaseUrl = window.location.origin;
    } else {
      finalBaseUrl = process.env.NEXT_PUBLIC_APP_URL 
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
        || (process.env.NODE_ENV === 'production' ? 'https://gobid.ro' : 'http://localhost:3000');
    }
  }

  // Get logo URL if not provided
  const finalLogoUrl = logoUrl || `${finalBaseUrl}/logo_negru.png`;

  return `
    <!DOCTYPE html>
    <html lang="ro">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Resetare Parolă - GoBid</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff; line-height: 1.6;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
          <tr>
            <td align="center" style="padding: 60px 20px;">
              <!-- Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto 50px;">
                <tr>
                  <td align="center" style="padding: 0 0 50px 0;">
                    <img src="${finalLogoUrl}" alt="GoBid" style="max-width: 140px; height: auto; display: block;" />
                  </td>
                </tr>
              </table>
              
              <!-- Main Content -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto;">
                <tr>
                  <td style="padding: 0;">
                    <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 600; color: #111827; text-align: center; letter-spacing: -0.5px;">
                      Resetare Parolă
                    </h1>
                    
                    <p style="margin: 0 0 40px 0; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
                      Salut${userName !== 'Utilizator' ? ` ${userName}` : ''},<br><br>
                      Ai solicitat resetarea parolei pentru contul tău GoBid. Apasă pe butonul de mai jos pentru a continua.
                    </p>
                    
                    <!-- Reset Button -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding: 0 0 40px 0;">
                          <a href="${resetLink}" 
                             style="background-color: #111827; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px; letter-spacing: -0.2px;">
                            Resetează Parola
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Alternative Link -->
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #9ca3af; text-align: center;">
                      Sau copiază și lipește acest link în browser:
                    </p>
                    <p style="margin: 0 0 40px 0; font-size: 13px; color: #6b7280; text-align: center; word-break: break-all; padding: 0 20px;">
                      <a href="${resetLink}" style="color: #111827; text-decoration: underline;">${resetLink}</a>
                    </p>
                    
                    <!-- Security Notice -->
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 0 0 40px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;">
                        ⚠️ Important
                      </p>
                      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                        Link-ul este valabil pentru ${expiresIn}. Dacă nu ai solicitat resetarea parolei, poți ignora acest email în siguranță.
                      </p>
                    </div>
                    
                    <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                      Dacă ai întrebări, te rugăm să ne contactezi la suport@gobid.ro
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
}

/**
 * Alias pentru compatibilitate cu codul existent
 */
export function getResetPasswordEmailTemplate(data: ResetPasswordEmailData): string {
  return generateResetPasswordEmail(data);
}

/**
 * Generează text simplu pentru email-ul de resetare parolă
 */
export function generateResetPasswordEmailText(data: ResetPasswordEmailData): string {
  const { resetLink, userName = 'Utilizator', expiresIn = '24 de ore' } = data;

  return `
Resetare Parolă - gobid.ro

Bună ${userName},

Ai solicitat resetarea parolei pentru contul tău de pe gobid.ro.

Pentru a reseta parola, accesează următorul link:
${resetLink}

Link-ul este valabil pentru ${expiresIn}.

Dacă nu ai solicitat resetarea parolei, poți ignora acest email.

Dacă ai întrebări, te rugăm să ne contactezi la suport@gobid.ro

---
© ${new Date().getFullYear()} gobid.ro - Toate drepturile rezervate
  `.trim();
}

