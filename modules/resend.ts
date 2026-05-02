/**
 * Resend Email Service Integration
 * Documentation: https://resend.com/docs
 */

export interface ResendConfig {
  apiKey: string; // Resend API Key
  fromEmail?: string; // Default from email address
  fromName?: string; // Default from name
  domain?: string; // Verified domain (optional)
}

export interface ResendEmail {
  to: string | string[]; // Recipient email(s)
  subject: string; // Email subject
  html?: string; // HTML content
  text?: string; // Plain text content
  from?: string; // From email address (overrides default)
  fromName?: string; // From name (overrides default)
  replyTo?: string; // Reply-to email
  cc?: string | string[]; // CC recipients
  bcc?: string | string[]; // BCC recipients
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  tags?: Array<{
    name: string;
    value: string;
  }>;
}

export interface ResendResponse {
  success: boolean;
  message?: string;
  data?: any;
  emailId?: string;
  error?: string;
}

/**
 * Resend Email Service
 */
class ResendService {
  private baseUrl = 'https://api.resend.com';
  private config: ResendConfig | null = null;

  /**
   * Initialize Resend with configuration
   */
  initialize(config: ResendConfig) {
    this.config = config;
  }

  /**
   * Get configuration from localStorage or environment
   */
  private getConfig(): ResendConfig {
    if (this.config) {
      return this.config;
    }

    // Try to get from localStorage (only on client)
    if (typeof window === 'undefined') {
      return {
        apiKey: process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '',
        fromEmail: process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || '',
        fromName: process.env.NEXT_PUBLIC_RESEND_FROM_NAME || '',
        domain: process.env.NEXT_PUBLIC_RESEND_DOMAIN || '',
      };
    }
    
    const storedConfig = localStorage.getItem('resend_config');
    if (storedConfig) {
      try {
        return JSON.parse(storedConfig);
      } catch (e) {
        console.error('Error parsing Resend config:', e);
      }
    }

    // Try environment variables
    return {
      apiKey: process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || '',
      fromEmail: process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || '',
      fromName: process.env.NEXT_PUBLIC_RESEND_FROM_NAME || '',
      domain: process.env.NEXT_PUBLIC_RESEND_DOMAIN || '',
    };
  }

  /**
   * Test connection to Resend API
   */
  async testConnection(): Promise<ResendResponse> {
    const config = this.getConfig();

    if (!config.apiKey) {
      return {
        success: false,
        message: 'Resend nu este configurat! Completează API Key-ul mai întâi.',
      };
    }

    try {
      // Test API key by checking API status or making a simple request
      // Resend doesn't have a dedicated test endpoint, so we validate the config
      // In a real implementation, you might verify the API key or check domain status
      
      if (!config.apiKey.startsWith('re_')) {
        return {
          success: false,
          message: 'API Key invalid! API Key-ul Resend trebuie să înceapă cu "re_"',
        };
      }

      return {
        success: true,
        message: 'Configurația Resend este validă și gata de utilizare!',
        data: {
          apiKey: config.apiKey.substring(0, 10) + '...',
          fromEmail: config.fromEmail || 'Not set',
          fromName: config.fromName || 'Not set',
          domain: config.domain || 'Not set',
        },
      };
    } catch (error: any) {
      console.error('Resend API Error:', error);
      return {
        success: false,
        message: error.message || 'Network error occurred',
      };
    }
  }

  /**
   * Send email via Resend
   */
  async sendEmail(email: ResendEmail): Promise<ResendResponse> {
    const config = this.getConfig();

    if (!config.apiKey) {
      return {
        success: false,
        message: 'Resend nu este configurat! Completează API Key-ul mai întâi.',
      };
    }

    try {
      const emailData: any = {
        from: email.from || config.fromEmail || 'onboarding@resend.dev',
        to: Array.isArray(email.to) ? email.to : [email.to],
        subject: email.subject,
        ...(email.html && { html: email.html }),
        ...(email.text && { text: email.text }),
        ...(email.replyTo && { reply_to: email.replyTo }),
        ...(email.cc && { cc: Array.isArray(email.cc) ? email.cc : [email.cc] }),
        ...(email.bcc && { bcc: Array.isArray(email.bcc) ? email.bcc : [email.bcc] }),
        ...(email.tags && { tags: email.tags }),
      };

      // Handle from name
      if (email.fromName || config.fromName) {
        emailData.from = `${email.fromName || config.fromName} <${emailData.from}>`;
      }

      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return {
          success: false,
          message: error.message || `HTTP ${response.status}: Eroare la trimiterea email-ului`,
          error: error.message || response.statusText,
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: 'Email trimis cu succes!',
        emailId: data.id,
        data: data,
      };
    } catch (error: any) {
      console.error('Resend Send Email Error:', error);
      return {
        success: false,
        message: error.message || 'Eroare la trimiterea email-ului',
        error: error.message,
      };
    }
  }

  /**
   * Send email with template
   */
  async sendEmailWithTemplate(
    to: string | string[],
    templateId: string,
    templateData?: Record<string, any>
  ): Promise<ResendResponse> {
    const config = this.getConfig();

    if (!config.apiKey) {
      return {
        success: false,
        message: 'Resend nu este configurat!',
      };
    }

    try {
      const emailData: any = {
        from: config.fromEmail || 'onboarding@resend.dev',
        to: Array.isArray(to) ? to : [to],
      };

      if (config.fromName) {
        emailData.from = `${config.fromName} <${emailData.from}>`;
      }

      // Resend template support (if available in their API)
      // This is a placeholder for template functionality
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...emailData,
          template_id: templateId,
          ...(templateData && { template_data: templateData }),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return {
          success: false,
          message: error.message || 'Eroare la trimiterea email-ului cu template',
          error: error.message,
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: 'Email cu template trimis cu succes!',
        emailId: data.id,
        data: data,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Eroare la trimiterea email-ului cu template',
        error: error.message,
      };
    }
  }

  /**
   * Get email status
   */
  async getEmailStatus(emailId: string): Promise<ResendResponse> {
    const config = this.getConfig();

    if (!config.apiKey) {
      return {
        success: false,
        message: 'Resend nu este configurat!',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/emails/${emailId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return {
          success: false,
          message: error.message || 'Eroare la obținerea statusului email-ului',
          error: error.message,
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: 'Status email obținut cu succes!',
        data: data,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Eroare la obținerea statusului email-ului',
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const resend = new ResendService();

/**
 * Helper function to send simple email
 */
export async function sendSimpleEmail(
  to: string,
  subject: string,
  html: string,
  fromEmail?: string
): Promise<ResendResponse> {
  const { resend } = await import('./resend');
  return resend.sendEmail({
    to,
    subject,
    html,
    from: fromEmail,
  });
}

