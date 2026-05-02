/**
 * Shim pentru clone care încă importă acest modul după migrarea la stocare R2-only.
 * Nu apelează Cloudinary — ștergerea fișierelor din bucket se face în `r2-server` din rutele de delete.
 */
export async function deleteCloudinaryPublicIdsBatched(
  _publicIds: string[],
  _env: { cloudName: string; apiKey: string; apiSecret: string }
): Promise<void> {
  // no-op
}
