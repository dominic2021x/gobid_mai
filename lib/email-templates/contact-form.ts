/**
 * Template email pentru notificarea echipelor când cineva trimite formularul de contact.
 * Trimis către contact@gobid.ro — același stil ca emailul cu cod de verificare (logo + layout curat).
 */

export type ContactSubject =
  | "contact"
  | "partners"
  | "website_error"
  | "tokens"
  | "other";

export interface ContactFormEmailData {
  name: string;
  email: string;
  subject?: ContactSubject;
  companyName?: string | null;
  message: string;
  logoUrl?: string;
  baseUrl?: string;
}

const SUBJECT_LABELS: Record<ContactSubject, string> = {
  contact: "Contact general / Întrebări",
  partners: "Parteneriate / Colaborare",
  website_error: "Eroare website / Bug",
  tokens: "Tokeni / Cont / Plată",
  other: "Altele",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generează HTML pentru emailul de notificare contact (către contact@gobid.ro).
 */
export function getContactFormNotificationEmail(data: ContactFormEmailData): string {
  const {
    name,
    email,
    subject = "contact",
    companyName,
    message,
    logoUrl,
    baseUrl,
  } = data;

  let finalBaseUrl = baseUrl;
  if (!finalBaseUrl) {
    finalBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
      (process.env.NODE_ENV === "production" ? "https://gobid.ro" : "http://localhost:3000");
  }
  const finalLogoUrl = logoUrl || `${finalBaseUrl}/logo_negru.png`;

  const subjectLabel = SUBJECT_LABELS[subject] || SUBJECT_LABELS.other;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const safeCompany = companyName ? escapeHtml(companyName) : null;

  return `
    <!DOCTYPE html>
    <html lang="ro">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Mesaj contact - gobid.ro</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff; line-height: 1.6;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
          <tr>
            <td align="center" style="padding: 60px 20px;">
              <!-- Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto 40px;">
                <tr>
                  <td align="center" style="padding: 0 0 40px 0;">
                    <img src="${finalLogoUrl}" alt="GoBid" style="max-width: 140px; height: auto; display: block;" />
                  </td>
                </tr>
              </table>

              <!-- Main Content -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto;">
                <tr>
                  <td style="padding: 0;">
                    <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600; color: #111827; letter-spacing: -0.5px;">
                      Mesaj nou de pe formularul de contact
                    </h1>

                    <!-- Subiect -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 12px 16px; background-color: #f3f4f6; border-radius: 8px; font-size: 14px; color: #374151;">
                          <strong>Subiect:</strong> ${escapeHtml(subjectLabel)}
                        </td>
                      </tr>
                    </table>

                    <!-- Detalii expeditor -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #f9fafb;">
                          <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Nume:</strong> ${safeName}</p>
                          <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Email:</strong> <a href="mailto:${safeEmail}" style="color: #2563eb;">${safeEmail}</a></p>
                          ${safeCompany ? `<p style="margin: 0; font-size: 14px; color: #6b7280;"><strong style="color: #111827;">Firmă:</strong> ${safeCompany}</p>` : ""}
                        </td>
                      </tr>
                    </table>

                    <!-- Mesaj -->
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111827;">Mesaj:</p>
                    <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff; font-size: 15px; color: #374151; line-height: 1.6;">
                      ${safeMessage}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 48px auto 0;">
                <tr>
                  <td align="center" style="padding: 32px 0 0 0; border-top: 1px solid #f3f4f6;">
                    <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">
                      Acest email a fost trimis de pe gobid.ro · Contact
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 13px; color: #9ca3af; text-align: center;">
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
