/**
 * SmartBill API Integration Service
 * Documentation: https://api.smartbill.ro/#!/prezentare_generala
 */

export interface SmartBillConfig {
  username: string; // SmartBill username/email
  token: string; // SmartBill API token
  companyVATNumber: string; // CUI/CIF companie
}

export interface SmartBillClient {
  name: string;
  vatCode?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  email?: string;
  phone?: string;
  bankAccount?: string;
  bankName?: string;
  contactPerson?: string;
}

export interface SmartBillProduct {
  name: string;
  code?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  vatName?: string;
  vatPercentage?: number;
  vatIncluded?: boolean;
  measurementUnit?: string;
}

export interface SmartBillInvoice {
  client?: SmartBillClient;
  issueDate: string; // Format: YYYY-MM-DD
  dueDate: string; // Format: YYYY-MM-DD
  currency: string; // RON, EUR, etc.
  exchangeRate?: number;
  products: SmartBillProduct[];
  isDraft?: boolean;
  number?: string;
  seriesName?: string;
  language?: string; // ro, en
  precision?: number; // Decimal precision
  payment?: {
    paymentType?: string; // cash, card, bank_transfer
    paymentDocument?: string;
    paymentDate?: string;
  };
}

export interface SmartBillResponse {
  success: boolean;
  message?: string;
  data?: any;
}

/**
 * SmartBill API Service
 */
class SmartBillService {
  private baseUrl = 'https://ws.smartbill.ro/SBORO/api';
  private config: SmartBillConfig | null = null;

  /**
   * Initialize SmartBill with configuration
   */
  initialize(config: SmartBillConfig) {
    this.config = config;
  }

  /**
   * Get configuration from localStorage or environment
   */
  private getConfig(): SmartBillConfig {
    if (this.config) {
      return this.config;
    }

    // Try to get from localStorage
    const storedConfig = typeof window !== 'undefined' ? localStorage.getItem('smartbill_config') : null;
    if (storedConfig) {
      try {
        return JSON.parse(storedConfig);
      } catch (e) {
        console.error('Error parsing SmartBill config:', e);
      }
    }

    // Try environment variables (accept both NEXT_PUBLIC_ and without prefix)
    return {
      username: process.env.NEXT_PUBLIC_SMARTBILL_USERNAME || process.env.SMARTBILL_USERNAME || '',
      token: process.env.NEXT_PUBLIC_SMARTBILL_TOKEN || process.env.SMARTBILL_TOKEN || '',
      companyVATNumber: process.env.NEXT_PUBLIC_SMARTBILL_VAT || process.env.SMARTBILL_VAT || '',
    };
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<SmartBillResponse> {
    const config = this.getConfig();

    if (!config.username || !config.token) {
      return {
        success: false,
        message: 'SmartBill configuration is missing. Please configure username and token.',
      };
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // SmartBill uses Basic Auth with username:token
      const auth = btoa(`${config.username}:${config.token}`);

      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          'Authorization': `Basic ${auth}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || `API Error: ${response.status}`,
          data: data,
        };
      }

      return {
        success: true,
        data: data,
      };
    } catch (error: any) {
      console.error('SmartBill API Error:', error);
      return {
        success: false,
        message: error.message || 'Network error occurred',
      };
    }
  }

  /**
   * Test connection to SmartBill API
   */
  async testConnection(): Promise<SmartBillResponse> {
    // Folosim /settings în loc de /settings/company pentru compatibilitate mai bună
    return this.makeRequest('/settings');
  }

  /**
   * Get company settings
   */
  async getCompanySettings() {
    return this.makeRequest('/settings/company');
  }

  /**
   * Get series (serii de facturi)
   */
  async getSeries() {
    return this.makeRequest('/series');
  }

  /**
   * Create invoice
   */
  async createInvoice(invoice: SmartBillInvoice): Promise<SmartBillResponse> {
    const config = this.getConfig();
    
    const invoicePayload = {
      companyVatCode: config.companyVATNumber,
      client: invoice.client,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate || 1,
      products: invoice.products,
      isDraft: invoice.isDraft || false,
      number: invoice.number || '',
      seriesName: invoice.seriesName || '',
      language: invoice.language || 'ro',
      precision: invoice.precision || 2,
      payment: invoice.payment,
    };

    return this.makeRequest('/invoice', 'POST', invoicePayload);
  }

  /**
   * Get invoice PDF
   */
  async getInvoicePDF(invoiceNumber: string, seriesName?: string): Promise<Blob | null> {
    const config = this.getConfig();
    
    try {
      const url = `${this.baseUrl}/invoice/pdf`;
      const auth = btoa(`${config.username}:${config.token}`);
      
      const params = new URLSearchParams({
        cif: config.companyVATNumber,
        number: invoiceNumber,
        seriesName: seriesName || '',
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        console.error('Error fetching PDF:', response.status);
        return null;
      }

      return await response.blob();
    } catch (error) {
      console.error('Error fetching invoice PDF:', error);
      return null;
    }
  }

  /**
   * Download invoice PDF
   */
  async downloadInvoicePDF(invoiceNumber: string, seriesName?: string, filename?: string) {
    const blob = await this.getInvoicePDF(invoiceNumber, seriesName);
    
    if (!blob) {
      throw new Error('Failed to fetch invoice PDF');
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `factura-${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceNumber: string, seriesName?: string) {
    const config = this.getConfig();
    
    const params = new URLSearchParams({
      cif: config.companyVATNumber,
      number: invoiceNumber,
      seriesName: seriesName || '',
    });

    return this.makeRequest(`/invoice?${params}`, 'DELETE');
  }

  /**
   * Get invoice by number
   */
  async getInvoice(invoiceNumber: string, seriesName?: string) {
    const config = this.getConfig();
    
    const params = new URLSearchParams({
      cif: config.companyVATNumber,
      number: invoiceNumber,
      seriesName: seriesName || '',
    });

    return this.makeRequest(`/invoice?${params}`, 'GET');
  }

  /**
   * Get clients list
   */
  async getClients() {
    return this.makeRequest('/clients');
  }

  /**
   * Create or update client
   */
  async saveClient(client: SmartBillClient): Promise<SmartBillResponse> {
    const config = this.getConfig();
    
    const clientPayload = {
      ...client,
      vatCode: client.vatCode || '',
    };

    return this.makeRequest('/client', 'POST', clientPayload);
  }

  /**
   * Get products list
   */
  async getProducts() {
    return this.makeRequest('/products');
  }

  /**
   * Create or update product
   */
  async saveProduct(product: any): Promise<SmartBillResponse> {
    return this.makeRequest('/product', 'POST', product);
  }
}

// Export singleton instance
export const smartbill = new SmartBillService();

/**
 * Helper function to create invoice from payment data
 */
export function createSmartBillInvoiceFromPayment(
  payment: any,
  clientInfo: any
): SmartBillInvoice {
  const today = new Date().toISOString().split('T')[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const client: SmartBillClient = {
    name: clientInfo.name || `${clientInfo.firstName || ''} ${clientInfo.lastName || ''}`.trim(),
    email: clientInfo.email,
    address: clientInfo.address,
    city: clientInfo.city || '',
    county: clientInfo.county || '',
    country: clientInfo.country || 'România',
    phone: clientInfo.phone,
    vatCode: clientInfo.vatCode || clientInfo.cui || '',
  };

  const products: SmartBillProduct[] = [];

  // Add payment items if available
  if (payment.items && Array.isArray(payment.items)) {
    payment.items.forEach((item: any) => {
      products.push({
        name: item.name || item.description || 'Serviciu',
        code: item.code || '',
        quantity: item.quantity || 1,
        unitPrice: item.price || item.amount || 0,
        unit: item.unit || 'buc',
        vatName: 'TVA',
        vatPercentage: item.vatPercentage || 19,
        vatIncluded: true,
      });
    });
  } else {
    // Single product from payment total
    products.push({
      name: payment.description || 'Plată servicii',
      quantity: 1,
      unitPrice: payment.total || payment.amount || 0,
      unit: 'buc',
      vatName: 'TVA',
      vatPercentage: 19,
      vatIncluded: true,
    });
  }

  return {
    client,
    issueDate: payment.date || today,
    dueDate: payment.dueDate || dueDateStr,
    currency: payment.currency || 'RON',
    products,
    language: 'ro',
    isDraft: false,
    payment: payment.status === 'paid' ? {
      paymentType: 'card',
      paymentDate: payment.date || today,
    } : undefined,
  };
}
