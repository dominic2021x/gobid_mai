/**
 * Apple Sign In – generare client_secret JWT pentru NextAuth sau exchange code.
 * Folosit de scriptul scripts/generate-apple-client-secret.ts.
 */
import * as jose from 'jose';

const APPLE_AUD = 'https://appleid.apple.com';
const MAX_EXP_SEC = 15777000; // ~6 luni (Apple max)

export interface AppleClientSecretOptions {
  teamId: string;
  keyId: string;
  clientId: string; // Services ID
  privateKeyPem: string; // conținutul fișierului .p8 (cu sau fără \\n escape)
}

/**
 * Generează JWT-ul folosit ca client_secret pentru Apple (NextAuth sau token exchange).
 * Cheia .p8 poate fi în env cu newline-uri ca "\\n" sau reale.
 */
export async function generateAppleClientSecret(options: AppleClientSecretOptions): Promise<string> {
  const { teamId, keyId, clientId, privateKeyPem } = options;
  const pem = privateKeyPem.replace(/\\n/g, '\n');
  const privateKey = await jose.importPKCS8(pem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + MAX_EXP_SEC)
    .sign(privateKey);
  return token;
}

/**
 * Generează client_secret din variabilele de mediu.
 * Necesare: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_ID, APPLE_PRIVATE_KEY (conținut .p8).
 */
export async function generateAppleClientSecretFromEnv(): Promise<string | null> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_ID || process.env.APPLE_SERVICE_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !clientId || !privateKey) {
    return null;
  }
  return generateAppleClientSecret({
    teamId,
    keyId,
    clientId,
    privateKeyPem: privateKey,
  });
}
