/**
 * Netopia mobilPay – flux bazat pe certificate (fără API Key)
 * Folosește: Semnătura + Public Key + Private Key din Setări tehnice (Puncte de vânzare)
 * Endpoint-uri: sandboxsecure.mobilpay.ro (test), secure.mobilpay.ro (live)
 *
 * Criptare AES-256-CBC (compatibilă cu PHP openssl_seal) – mobilpay-card folosește RC4
 * care nu mai e acceptat de mobilPay → eroare "signature is missing".
 */

// @ts-expect-error mobilpay-card nu are types
import MobilPay from 'mobilpay-card';
import { buildMobilPayRequestAes } from './netopia-mobilpay-aes';

export interface MobilPayPaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  details: string;
  confirmUrl: string;
  returnUrl: string;
  billing: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    county?: string;
    city?: string;
    address?: string;
  };
}

export interface MobilPayFormResult {
  success: boolean;
  /** URL la care trebuie POST-ată formularul */
  formUrl: string;
  /** Câmp env_key pentru formular */
  env_key: string;
  /** Câmp data pentru formular */
  data: string;
  /** IV – obligatoriu pentru mobilPay (RC4: string gol) */
  iv: string;
  /** Algoritm criptare – obligatoriu pentru mobilPay (rc4) */
  cipher: string;
  message?: string;
}

/**
 * Construiește cererea mobilPay (XML semnat și criptat) pentru redirect la plată.
 * Frontend-ul trebuie să creeze un form POST cu action=formUrl și câmpuri env_key, data.
 */
export function buildMobilPayRequest(
  signature: string,
  publicKey: string,
  params: MobilPayPaymentParams,
  sandbox: boolean,
  formBaseUrlOverride?: string
): MobilPayFormResult {
  if (!signature?.trim() || !publicKey?.trim()) {
    return {
      success: false,
      formUrl: '',
      env_key: '',
      data: '',
      iv: '',
      cipher: 'aes-256-cbc',
      message: 'Semnătura și Public Key sunt obligatorii.',
    };
  }

  try {
    const b = params.billing;
    const address = [b.county || 'București', b.city || 'București', b.address || '-'].join(', ');
    const result = buildMobilPayRequestAes(publicKey.trim(), {
      signature: signature.trim(),
      orderId: params.orderId,
      amount: params.amount,
      currency: params.currency || 'RON',
      details: params.details,
      confirmUrl: params.confirmUrl,
      returnUrl: params.returnUrl,
      billing: {
        firstName: b.firstName || 'Client',
        lastName: b.lastName || 'gobid',
        address,
        email: b.email,
        mobile_phone: b.phone || '0700000000',
      },
    });

    const defaultRoot = sandbox ? 'https://sandboxsecure.mobilpay.ro' : 'https://secure.mobilpay.ro';
    const custom = formBaseUrlOverride?.trim();
    const formUrl =
      custom && /^https?:\/\//i.test(custom) ? custom.replace(/\/$/, '') : defaultRoot;

    return {
      success: true,
      formUrl,
      env_key: result.env_key,
      data: result.data,
      iv: result.iv,
      cipher: result.cipher,
    };
  } catch (err) {
    return {
      success: false,
      formUrl: '',
      env_key: '',
      data: '',
      iv: '',
      cipher: 'aes-256-cbc',
      message: err instanceof Error ? err.message : 'Eroare la construirea cererii mobilPay',
    };
  }
}

export interface MobilPayValidateResult {
  success: boolean;
  action?: 'confirmed' | 'paid' | 'paid_pending' | 'confirmed_pending';
  orderId?: string;
  error?: string;
  /** Răspuns XML de trimis înapoi la mobilPay */
  responseXml?: string;
  /** Content-Type pentru răspuns */
  contentType?: string;
}

/**
 * Validează IPN-ul primit de la mobilPay (env_key, data, iv?, cipher?).
 * Când cipher=aes-256-cbc, folosește decriptare AES; altfel RC4 (mobilpay-card).
 */
export async function validateMobilPayIPN(
  env_key: string,
  data: string,
  privateKey: string,
  options?: { iv?: string; cipher?: string }
): Promise<MobilPayValidateResult> {
  if (!env_key || !data || !privateKey?.trim()) {
    return { success: false, error: 'env_key, data și privateKey sunt obligatorii.' };
  }

  const cipher = options?.cipher?.toLowerCase() || 'rc4';
  const iv = options?.iv ?? '';

  if (cipher === 'aes-256-cbc' && iv) {
    return validateMobilPayIPNAes(env_key, data, iv, privateKey);
  }

  try {
    const mobilPay = new MobilPay('dummy');
    mobilPay.setPrivateKey(privateKey.trim());
    const response = await mobilPay.validatePayment(env_key, data);

    if (response.error) {
      return {
        success: false,
        error: response.errorMessage || String(response.error),
        responseXml: response.res?.send,
        contentType: response.res?.set?.value || 'application/xml',
      };
    }

    const orderId =
      (response.orderInvoice as Record<string, unknown>)?.orderId as string | undefined;

    return {
      success: true,
      action: response.action as MobilPayValidateResult['action'],
      orderId,
      responseXml: response.res?.send,
      contentType: response.res?.set?.value || 'application/xml',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Eroare la validarea IPN',
    };
  }
}

async function validateMobilPayIPNAes(
  env_key: string,
  data: string,
  iv: string,
  privateKey: string
): Promise<MobilPayValidateResult> {
  const { decryptMobilPayAes } = await import('./netopia-mobilpay-aes');
  const { parseString } = await import('xml2js');

  return new Promise((resolve) => {
    try {
      const xml = decryptMobilPayAes(privateKey.trim(), env_key, data, iv);
      parseString(xml, { explicitArray: false }, (err: Error | null, result: unknown) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }
        const order = (result as { order?: Record<string, unknown> })?.order;
        const mobilpay = order?.mobilpay as { action?: string; error?: { _?: string; $?: { code?: string } } } | undefined;
        const invoice = order?.invoice as { $?: { id?: string } } | undefined;
        const orderId = invoice?.$?.id ?? (order as { $?: { id?: string } })?.$?.id;
        const action = mobilpay?.action;
        const errorObj = mobilpay?.error;
        const errorCode = errorObj?.$?.code ?? '0';
        const errorMsg = (errorObj as { _?: string })?._ ?? '';

        if (parseInt(String(errorCode), 10) !== 0) {
          resolve({
            success: false,
            error: errorMsg,
            orderId: String(orderId),
            responseXml: `<?xml version="1.0" encoding="utf-8"?><crc error_code="${errorCode}">${errorMsg}</crc>`,
            contentType: 'application/xml',
          });
        } else {
          resolve({
            success: true,
            action: action as MobilPayValidateResult['action'],
            orderId: String(orderId),
            responseXml: `<?xml version="1.0" encoding="utf-8"?><crc>${errorMsg}</crc>`,
            contentType: 'application/xml',
          });
        }
      });
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Eroare la decriptarea IPN',
      });
    }
  });
}
