/**
 * Self-hosted cron: rulează sincronizarea licitatii-insolventa.ro.
 * Usage: npx tsx scripts/run-sync.ts
 * Cron example: 0 6 * * * cd /path/to/project && npx tsx scripts/run-sync.ts
 */

import { syncAllListings } from "../lib/scraper/sync";

async function main() {
  console.log("[run-sync] Starting sync...");
  const summary = await syncAllListings();
  console.log("[run-sync] Done:", {
    pagesCrawled: summary.pagesCrawled,
    itemsFound: summary.itemsFound,
    inserted: summary.inserted,
    updated: summary.updated,
    softDeleted: summary.softDeleted,
    detailsFetched: summary.detailsFetched,
    errors: summary.errors.length,
  });
  if (summary.errors.length) {
    summary.errors.forEach((e) => console.error("[run-sync]", e));
  }
}

main().catch((e) => {
  console.error("[run-sync] Fatal:", e);
  process.exit(1);
});
