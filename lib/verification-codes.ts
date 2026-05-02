// Store verification codes in memory (în producție, folosește Redis sau o bază de date)
// Adăugăm și persistență simplă în fișier pentru dev, ca să nu se piardă codurile la refresh server.
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), '.next', 'verification-codes.json');

type VerificationData = { code: string; expiresAt: number; userId: string };

const verificationCodes = new Map<string, VerificationData>();

const loadPersistedCodes = () => {
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, VerificationData>;
      const now = Date.now();
      let removedExpired = false;
      Object.entries(parsed).forEach(([email, data]) => {
        if (data.expiresAt > now) {
          verificationCodes.set(email, data);
        } else {
          verificationCodes.delete(email);
          removedExpired = true;
        }
      });
      if (removedExpired) persistCodes();
    }
  } catch (e) {
    console.warn('[verification-codes] Cannot read persisted codes:', e);
  }
};

// Load persisted codes (best effort)
loadPersistedCodes();

const persistCodes = () => {
  try {
    const obj: Record<string, VerificationData> = {};
    verificationCodes.forEach((value, key) => {
      obj[key] = value;
    });
    fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(obj), 'utf-8');
  } catch (e) {
    console.warn('[verification-codes] Cannot persist codes:', e);
  }
};




// Clean up expired codes every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [email, data] of verificationCodes.entries()) {
      if (data.expiresAt < now) {
        verificationCodes.delete(email);
      }
    }
    persistCodes();
  }, 10 * 60 * 1000);
}

// Debug function to log all stored codes
export function debugVerificationCodes() {
  console.log('📋 Stored verification codes:', Array.from(verificationCodes.entries()).map(([email, data]) => ({
    email,
    code: data.code,
    expiresAt: new Date(data.expiresAt).toISOString(),
    userId: data.userId
  })));
}

export function storeVerificationCode(email: string, code: string, userId: string, expiresInMinutes: number = 15): void {
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  verificationCodes.set(email.toLowerCase(), {
    code,
    expiresAt,
    userId
  });
  persistCodes();
}

export function getVerificationCode(email: string): { code: string; expiresAt: number; userId: string } | null {
  const normalizedEmail = email.toLowerCase();
  let data = verificationCodes.get(normalizedEmail);
  if (!data) {
    // În Next dev / serverless, rutele pot avea instanțe separate ale modulului.
    // Reîncărcăm persistența înainte să declarăm codul invalid.
    loadPersistedCodes();
    data = verificationCodes.get(normalizedEmail);
  }
  if (!data || data.expiresAt < Date.now()) {
    verificationCodes.delete(normalizedEmail);
    persistCodes();
    return null;
  }
  return data;
}

export function deleteVerificationCode(email: string): void {
  verificationCodes.delete(email.toLowerCase());
  persistCodes();
}

