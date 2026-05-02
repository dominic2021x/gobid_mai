/**
 * Statistici pentru panoul admin „Curățare imagini” (GET + comparație înainte/după tick).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getR2EnvConfig } from "@/lib/upload/r2-server";

/** Rezultat din RPC `uploaded_images_cleanup_diag` — explică de ce mark_orphan poate fi 0. */
export type CleanupDiag = {
  activeTotal: number;
  activeWithoutProductImages: number;
  activeWithoutPiUploadsPrefix: number;
  blockedWrongStoragePrefix: number;
  blockedGraceLessThan24hNoPi: number;
  blockedPendingOrProcessingJobs: number;
  orphanEligibleStrict: number;
};

function parseCleanupDiag(raw: unknown): CleanupDiag | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const n = (key: string): number | null => {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const activeTotal = n("activeTotal");
  if (activeTotal === null) return null;
  return {
    activeTotal,
    activeWithoutProductImages: n("activeWithoutProductImages") ?? 0,
    activeWithoutPiUploadsPrefix: n("activeWithoutPiUploadsPrefix") ?? 0,
    blockedWrongStoragePrefix: n("blockedWrongStoragePrefix") ?? 0,
    blockedGraceLessThan24hNoPi: n("blockedGraceLessThan24hNoPi") ?? 0,
    blockedPendingOrProcessingJobs: n("blockedPendingOrProcessingJobs") ?? 0,
    orphanEligibleStrict: n("orphanEligibleStrict") ?? 0,
  };
}

export type CleanupDashboardStats = {
  at: string;
  r2Configured: boolean;
  diag?: CleanupDiag | null;
  totals: {
    /** Produse distincte cu ≥1 uploaded_images activ legat prin product_images */
    distinctProductsWithActiveImages: number | null;
    /** Rânduri uploaded_images cu deleted_at IS NULL */
    uploadedImagesActive: number | null;
    /** Toate cu deleted_at setat (grace + coadă purge) */
    uploadedImagesSoftDeletedTotal: number | null;
    /** Soft-delete în ultimele 24h — încă nu sunt eligibile pentru DeleteObject R2 */
    softDeletedGraceUnder24h: number | null;
    /** Eligibili pentru marcaj orfan (soft-delete DB) la următorul mark_orphan */
    orphanCandidatesEligible: number | null;
    /** Eligibili pentru ștergere fizică R2 (soft-delete ≥24h) */
    readyForPhysicalR2Purge: number | null;
  };
  warnings: string[];
};

export async function getCleanupDashboardStats(db: SupabaseClient): Promise<CleanupDashboardStats> {
  const warnings: string[] = [];
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    activeRes,
    softTotalRes,
    softGraceRes,
    orphanRpc,
    purgeRpc,
    distinctProductsRpc,
    diagRpc,
  ] = await Promise.all([
    db.from("uploaded_images").select("*", { count: "exact", head: true }).is("deleted_at", null),
    db
      .from("uploaded_images")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null),
    db
      .from("uploaded_images")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoffIso),
    db.rpc("count_uploaded_images_orphan_soft_delete_candidates"),
    db.rpc("count_uploaded_images_r2_purge_ready"),
    db.rpc("count_distinct_products_with_active_uploaded_images"),
    db.rpc("uploaded_images_cleanup_diag"),
  ]);

  if (diagRpc.error) {
    warnings.push(`Diagnostic cleanup indisponibil (aplică migrarea sau RPC): ${diagRpc.error.message}`);
  }
  if (distinctProductsRpc.error) {
    warnings.push(
      `Nu s-a putut număra produsele cu poze active (aplică migrarea SQL sau verifică RPC): ${distinctProductsRpc.error.message}`
    );
  }
  if (orphanRpc.error) {
    warnings.push(`Nu s-a putut număra coada orfanilor (aplică migrarea SQL sau verifică RPC): ${orphanRpc.error.message}`);
  }
  if (purgeRpc.error) {
    warnings.push(`Nu s-a putut număra coada R2 purge: ${purgeRpc.error.message}`);
  }

  return {
    at: new Date().toISOString(),
    r2Configured: getR2EnvConfig() !== null,
    diag: diagRpc.error ? null : parseCleanupDiag(diagRpc.data),
    totals: {
      distinctProductsWithActiveImages: distinctProductsRpc.error
        ? null
        : Number(distinctProductsRpc.data ?? 0),
      uploadedImagesActive: activeRes.count ?? null,
      uploadedImagesSoftDeletedTotal: softTotalRes.count ?? null,
      softDeletedGraceUnder24h: softGraceRes.count ?? null,
      orphanCandidatesEligible: orphanRpc.error ? null : Number(orphanRpc.data ?? 0),
      readyForPhysicalR2Purge: purgeRpc.error ? null : Number(purgeRpc.data ?? 0),
    },
    warnings,
  };
}
