/**
 * Netopia Payments Integration
 * Placeholder for future Netopia payment gateway integration
 */

// Placeholder exports - to be implemented
export const netopiaConfig = {
  enabled: false,
  apiKey: process.env.NETOPIA_API_KEY || '',
  merchantId: process.env.NETOPIA_MERCHANT_ID || '',
};

export async function processNetopiaPayment() {
  throw new Error('Netopia payment integration not yet implemented');
}

