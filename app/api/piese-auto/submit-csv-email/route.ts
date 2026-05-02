/**
 * POST /api/piese-auto/submit-csv-email
 * Multipart: file (.csv), termsAccepted=true — notificare către support (Resend).
 * Necesită utilizator autentificat (cookie sau Bearer).
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthUser } from "@/lib/auth/getRequestAuthUser";
import {
  rateLimitOrThrow,
  RateLimitError,
  getClientIp,
  pruneStore,
} from "@/lib/security/rateLimit";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
/** Conținut CSV inclus în HTML ca fallback (multe servere de mail filtrează atașamente). */
const CSV_INLINE_HTML_MAX_BYTES = 512 * 1024;

function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || "import.csv";
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F]/g, "_").slice(0, 120);
  return cleaned.toLowerCase().endsWith(".csv") ? cleaned : `${cleaned || "import"}.csv`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Una sau mai multe adrese din env (separate prin virgulă sau ;). */
function resolveSupportInboxList(): string[] {
  const raw =
    process.env.PIESE_AUTO_IMPORT_CSV_TO_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.LEGAL_CONTACT_EMAIL ||
    "contact@gobid.ro";
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isLikelyEmail(s));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out.length > 0 ? out : ["contact@gobid.ro"];
}

function formatResendError(status: number, raw: string, parsed: Record<string, unknown>): string {
  const msg = parsed.message;
  if (typeof msg === "string" && msg.length > 0) return msg;
  const errors = parsed.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    try {
      return JSON.stringify(errors);
    } catch {
      return String(errors[0]);
    }
  }
  if (raw.length > 0 && raw.length < 800) return raw;
  return `Resend HTTP ${status}`;
}

async function resendSend(body: Record<string, unknown>, apiKey: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const data = parsed as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    const msg = formatResendError(res.status, raw, parsed);
    console.error("[piese-auto/submit-csv-email] Resend raw response:", res.status, raw.slice(0, 1500));
    return { ok: false, error: msg };
  }
  return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
}

/** În Node, câmpul fișier din FormData poate fi Blob fără `instanceof File`. */
function isMultipartFilePart(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Autentificare necesară." },
        { status: 401 }
      );
    }

    const ip = getClientIp(request);
    pruneStore();
    try {
      await rateLimitOrThrow({ key: `piese-auto-csv-email:${user.id}`, limit: 10, windowSeconds: 3600 });
      await rateLimitOrThrow({ key: `piese-auto-csv-email-ip:${ip}`, limit: 20, windowSeconds: 3600 });
    } catch (e) {
      if (e instanceof RateLimitError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
      }
      throw e;
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Cerere invalidă." }, { status: 400 });
    }

    const terms = formData.get("termsAccepted");
    if (terms !== "true" && terms !== "on") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Trebuie să bifezi acordul (import anunțuri de către echipa GoBid și acceptarea termenilor) înainte de a trimite fișierul.",
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || typeof file === "string" || !isMultipartFilePart(file)) {
      return NextResponse.json({ ok: false, error: "Lipsește fișierul CSV." }, { status: 400 });
    }

    const nameHint = formData.get("originalFilename");
    const rawName =
      typeof nameHint === "string" && nameHint.trim().length > 0
        ? nameHint.trim()
        : file instanceof File && file.name
          ? file.name
          : "import.csv";
    if (!rawName.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ ok: false, error: "Se acceptă doar fișiere .csv." }, { status: 400 });
    }

    const size = file.size;
    if (size <= 0 || size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Fișierul trebuie să aibă între 1 și ${MAX_BYTES / (1024 * 1024)} MB.` },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY || "";
    if (!resendApiKey) {
      return NextResponse.json(
        { ok: false, error: "Trimiterea către support nu este configurată pe server." },
        { status: 503 }
      );
    }

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL ||
      "noreply@gobid.ro";

    const toList = resolveSupportInboxList();
    const toField: string | string[] = toList.length === 1 ? toList[0]! : toList;

    const userEmail = (user.email ?? "").trim();
    const displayName =
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      userEmail ||
      user.id;

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const filename = safeFilename(rawName);
    const csvUtf8 = buf.toString("utf-8");

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
      (process.env.NODE_ENV === "production" ? "https://gobid.ro" : "http://localhost:3000");

    const csvInlineHtml =
      size <= CSV_INLINE_HTML_MAX_BYTES
        ? `
      <hr style="margin:24px 0;border:none;border-top:1px solid #ddd" />
      <p><strong>Conținut CSV (copie în email)</strong> — folosește asta dacă atașamentul <code>.csv</code> nu apare în clientul de mail.</p>
      <pre style="white-space:pre-wrap;word-break:break-word;max-height:560px;overflow:auto;background:#f4f4f5;padding:16px;border-radius:8px;font-size:12px;line-height:1.45;border:1px solid #e5e7eb">${escapeHtml(csvUtf8)}</pre>
    `
        : `
      <p><em>Fișier mare (${Math.round(size / 1024)} KB) — conținutul este doar în atașamentul .csv.</em></p>
    `;

    const html = `
      <p><strong>Import CSV – Piese auto</strong></p>
      <p>Un utilizator a trimis un fișier CSV către support, pentru procesare manuală.</p>
      <ul>
        <li><strong>Utilizator:</strong> ${escapeHtml(displayName)}</li>
        <li><strong>Email:</strong> ${escapeHtml(userEmail || "—")}</li>
        <li><strong>User ID:</strong> ${escapeHtml(user.id)}</li>
        <li><strong>Fișier:</strong> ${escapeHtml(filename)} (${Math.round(size / 1024)} KB)</li>
        <li><strong>Trimis la:</strong> ${escapeHtml(new Date().toISOString())}</li>
      </ul>
      <p>Există și un fișier <strong>.csv</strong> atașat la acest mesaj (dacă îl permite clientul de mail).</p>
      <p><a href="${escapeHtml(baseUrl)}">${escapeHtml(baseUrl)}</a></p>
      ${csvInlineHtml}
    `.trim();

    const textPreview =
      size <= 80 * 1024
        ? `\n\n--- CSV (început) ---\n${csvUtf8.slice(0, 60000)}${csvUtf8.length > 60000 ? "\n… [truncat în varianta text]" : ""}`
        : "\n\n[Fișier mare: vezi atașamentul .csv sau corpul HTML al emailului.]";

    const supportPayload: Record<string, unknown> = {
      from: fromEmail,
      to: toField,
      subject: `[gobid.ro] Import CSV piese auto – ${userEmail || user.id.slice(0, 8)}`,
      html,
      text: `Import CSV piese auto\nUtilizator: ${displayName}\nEmail: ${userEmail || "—"}\nUser ID: ${user.id}\nFișier: ${filename} (${Math.round(size / 1024)} KB)\n${textPreview}`,
      attachments: [
        {
          filename,
          content: base64,
          content_type: "text/csv",
        },
      ],
    };

    const toLowerSet = new Set(toList.map((t) => t.toLowerCase()));
    const ccExtra: string[] = [];
    for (const cand of [process.env.ADMIN_EMAIL, process.env.SUPPORT_EMAIL]) {
      const e = typeof cand === "string" ? cand.trim() : "";
      if (e && isLikelyEmail(e) && !toLowerSet.has(e.toLowerCase())) {
        ccExtra.push(e);
        toLowerSet.add(e.toLowerCase());
      }
    }
    if (ccExtra.length === 1) {
      supportPayload.cc = ccExtra[0];
    } else if (ccExtra.length > 1) {
      supportPayload.cc = ccExtra;
    }

    if (userEmail && isLikelyEmail(userEmail)) {
      supportPayload.reply_to = userEmail;
    }

    console.log(
      "[piese-auto/submit-csv-email] sending",
      JSON.stringify({ from: fromEmail, to: toList, filename, sizeBytes: size })
    );

    const supportResult = await resendSend(supportPayload, resendApiKey);
    if (!supportResult.ok) {
      console.error("[piese-auto/submit-csv-email] Resend (support):", supportResult.error);
      return NextResponse.json(
        {
          ok: false,
          error:
            supportResult.error ??
            "Nu s-a putut trimite către support. Verifică în Resend că domeniul „from” este verificat și că API key-ul e valid.",
        },
        { status: 502 }
      );
    }

    if (supportResult.id) {
      console.log("[piese-auto/submit-csv-email] Resend support message id:", supportResult.id, "to:", toList.join(", "));
    }

    if (userEmail && isLikelyEmail(userEmail)) {
      const confirmHtml = `
        <p>Bună,</p>
        <p>Am primit fișierul tău <strong>${escapeHtml(filename)}</strong> pentru import (piese auto). Echipa GoBid îl procesează; anunțurile apar de regulă în <strong>1–3 zile lucrătoare</strong>.</p>
        <p>Dacă ai întrebări, răspunde la acest email sau scrie pe canalul de support.</p>
        <p>— Echipa GoBid</p>
      `.trim();
      const confirmResult = await resendSend(
        {
          from: fromEmail,
          to: [userEmail],
          subject: "[gobid.ro] Am primit fișierul CSV pentru import",
          html: confirmHtml,
          text: `Am primit fișierul ${filename} pentru import (piese auto). Procesare: de regulă 1-3 zile lucrătoare. — GoBid`,
        },
        resendApiKey
      );
      if (!confirmResult.ok) {
        console.warn("[piese-auto/submit-csv-email] Resend (confirmare user):", confirmResult.error);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Fișierul a fost trimis către support. Verifică și căsuța ta de email pentru confirmare.",
      resendId: supportResult.id,
    });
  } catch (e) {
    console.error("[piese-auto/submit-csv-email]", e);
    return NextResponse.json(
      { ok: false, error: "Eroare internă. Încearcă din nou." },
      { status: 500 }
    );
  }
}
