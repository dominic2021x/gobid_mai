/**
 * Criptare mobilPay cu AES-256-CBC – compatibilă cu PHP openssl_seal (mobilPay așteaptă AES pe servere moderne).
 * mobilpay-card folosește RC4 care nu mai e acceptat → eroare "signature is missing".
 */

import crypto from 'crypto';
import { Builder } from 'xml2js';

const CIPHER = 'aes-256-cbc';
const AES_KEY_LEN = 32;
const IV_LEN = 16;

export interface MobilPayAesParams {
  signature: string;
  orderId: string;
  amount: number;
  currency: string;
  details: string;
  confirmUrl: string;
  returnUrl: string;
  billing: {
    firstName: string;
    lastName: string;
    address: string;
    email: string;
    mobile_phone: string;
  };
  shipping?: {
    firstName: string;
    lastName: string;
    address: string;
    email: string;
    mobile_phone: string;
  };
}

function formatTimestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}${h}${min}${s}`;
}

function buildOrderXml(params: MobilPayAesParams): string {
  const ship = params.shipping ?? params.billing;
  const builder = new Builder({ cdata: true });
  const obj = {
    order: {
      $: {
        id: params.orderId,
        timestamp: formatTimestamp(),
        type: 'card',
      },
      signature: params.signature,
      url: {
        return: params.returnUrl,
        confirm: params.confirmUrl,
      },
      invoice: {
        $: {
          currency: params.currency,
          amount: typeof params.amount === 'number' ? params.amount.toFixed(2) : String(params.amount),
        },
        details: params.details,
        contact_info: {
          billing: {
            $: { type: 'person' },
            first_name: params.billing.firstName,
            last_name: params.billing.lastName,
            address: params.billing.address,
            email: params.billing.email,
            mobile_phone: params.billing.mobile_phone,
          },
          shipping: {
            $: { type: 'person' },
            first_name: ship.firstName,
            last_name: ship.lastName,
            address: ship.address,
            email: ship.email,
            mobile_phone: ship.mobile_phone,
          },
        },
      },
      ipn_cipher: CIPHER,
    },
  };
  return builder.buildObject(obj);
}

/**
 * Criptează XML mobilPay cu AES-256-CBC, compatibil cu PHP openssl_seal.
 */
export function encryptMobilPayAes(publicKeyPem: string, xml: string): {
  env_key: string;
  data: string;
  iv: string;
  cipher: string;
} {
  const key = crypto.randomBytes(AES_KEY_LEN);
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(CIPHER, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(xml, 'utf8'),
    cipher.final(),
  ]);

  const envKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    key
  );

  return {
    env_key: envKey.toString('base64'),
    data: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    cipher: CIPHER,
  };
}

/**
 * Decriptează răspuns mobilPay (IPN) criptat cu AES-256-CBC.
 * Compatibil cu PHP openssl_open.
 */
export function decryptMobilPayAes(
  privateKeyPem: string,
  envKeyB64: string,
  dataB64: string,
  ivB64: string
): string {
  const encKey = Buffer.from(envKeyB64, 'base64');
  const encData = Buffer.from(dataB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');

  const key = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    encKey
  );

  const decipher = crypto.createDecipheriv(CIPHER, key, iv);
  return decipher.update(encData, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Construiește cererea mobilPay criptată cu AES-256-CBC.
 */
export function buildMobilPayRequestAes(
  publicKeyPem: string,
  params: MobilPayAesParams
): { env_key: string; data: string; iv: string; cipher: string } {
  const xml = buildOrderXml(params);
  return encryptMobilPayAes(publicKeyPem, xml);
}
