/**
 * GET – statistici detaliate (orfani, cozi R2)
 * POST – cleanup_tick întoarce și snapshot înainte/după pentru UI „live” / delta
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { getCleanupDashboardStats } from "@/lib/uploaded-images/cleanup-dashboard-stats";
import { runUploadedImagesCleanupTick } from "@/lib/uploaded-images/cleanup-worker";
import { runR2OrphanSampleReconcile } from "@/lib/uploaded-images/r2-orphan-reconcile";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin indisponibil" }, { status: 503 });
  }

  try {
    const stats = await getCleanupDashboardStats(supabaseAdmin);
    return NextResponse.json({
      success: true,
      stats,
      notes: [
        "„În uz (active)” = câte rânduri are tabela uploaded_images (poze/fișiere), nu câte produse ai în catalog. Un produs poate avea zeci de imagini.",
        "„Produse cu poză activă” = câte produse distincte au cel puțin o poză legată în product_images (numără real câte SKU-uri au galerie).",
        "Secțiunea „De ce nu se șterg orfanii?” folosește RPC-ul uploaded_images_cleanup_diag: dacă «active fără product_images» = 0, tick-ul nu are ce marca — pozele sunt încă referite din products.images.",
        "Orfan eligibil = încărcare cu ≥24h, fără product_images, fără job pending/processing, cheie uploads/…",
        "Grace 24h: după soft-delete în DB, obiectul R2 se șterge abia după încă 24h (configurare SQL).",
        "Un singur tick procesează în batch (ex. 50); repetă dacă mai sunt orfani sau rânduri în coadă.",
      ],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Eroare statistici";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin indisponibil" }, { status: 503 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalid" }, { status: 400 });
  }

  const action = body.action;

  if (action === "cleanup_tick") {
    try {
      const statsBefore = await getCleanupDashboardStats(supabaseAdmin);
      const tick = await runUploadedImagesCleanupTick(supabaseAdmin);
      const statsAfter = await getCleanupDashboardStats(supabaseAdmin);

      const t = statsBefore.totals;
      const a = statsAfter.totals;

      const delta = {
        orphanCandidatesEligible:
          t.orphanCandidatesEligible != null && a.orphanCandidatesEligible != null
            ? t.orphanCandidatesEligible - a.orphanCandidatesEligible
            : null,
        readyForPhysicalR2Purge:
          t.readyForPhysicalR2Purge != null && a.readyForPhysicalR2Purge != null
            ? t.readyForPhysicalR2Purge - a.readyForPhysicalR2Purge
            : null,
        uploadedImagesActive:
          t.uploadedImagesActive != null && a.uploadedImagesActive != null
            ? t.uploadedImagesActive - a.uploadedImagesActive
            : null,
        uploadedImagesSoftDeletedTotal:
          t.uploadedImagesSoftDeletedTotal != null && a.uploadedImagesSoftDeletedTotal != null
            ? a.uploadedImagesSoftDeletedTotal - t.uploadedImagesSoftDeletedTotal
            : null,
      };

      return NextResponse.json({
        success: true,
        statsBefore,
        statsAfter,
        delta,
        tick,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare cleanup_tick";
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }

  if (action === "r2_audit") {
    try {
      const t0 = Date.now();
      const statsBefore = await getCleanupDashboardStats(supabaseAdmin);
      const audit = await runR2OrphanSampleReconcile(supabaseAdmin, { startedAtMs: t0 });
      const statsAfter = await getCleanupDashboardStats(supabaseAdmin);
      return NextResponse.json({
        success: true,
        executionMs: Date.now() - t0,
        statsBefore,
        statsAfter,
        ...audit,
        at: new Date().toISOString(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare r2_audit";
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Acțiune necunoscută. Folosiți action: "cleanup_tick" sau "r2_audit".',
    },
    { status: 400 }
  );
}
