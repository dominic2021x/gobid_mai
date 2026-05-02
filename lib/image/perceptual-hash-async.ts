/**
 * Placeholder for async perceptual-hash dedupe (queue / cron).
 * Wire to a worker that: downscale → pHash/blockhash → store → optional merge of near-duplicates.
 *
 * @see docs/image-pipeline-hardening.md
 */
export async function enqueuePerceptualHashJob(_uploadedImageId: string): Promise<void> {
  if (process.env.PERCEPTUAL_HASH_QUEUE_ENABLED === "true") {
    // TODO: push to QStash / Supabase queue / internal cron
  }
}
