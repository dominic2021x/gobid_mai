/** Limită aliniată S3 (chei ≤ 1024 caractere). */
export const UPLOADED_IMAGE_STORAGE_KEY_MAX_LEN = 1024;

/**
 * `uploads/` + segmente: litere, cifre, `_`, `-`, `.`, `/` (fără spații sau caractere de control).
 * Ex.: uploads/{uuid}/uuid-filename.jpg
 */
const SAFE_STORAGE_KEY_REGEX = /^uploads\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;

/**
 * Doar chei generate de aplicație (`uploads/{userId}/...`) — apărare path traversal / chei greșite.
 */
export function isAllowedPurgeStorageKey(storageKey: string): boolean {
  const k = storageKey.trim();
  if (k.length === 0 || k.length > UPLOADED_IMAGE_STORAGE_KEY_MAX_LEN) return false;
  if (!SAFE_STORAGE_KEY_REGEX.test(k)) return false;
  if (k.includes("..")) return false;
  const segments = k.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg.includes("..")) return false;
  }
  return true;
}
