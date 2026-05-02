import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, pruneStore } from "@/lib/security/rateLimit";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { getContactFormNotificationEmail } from "@/lib/email-templates/contact-form";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 10;

const SUBJECT_VALUES = ["contact", "partners", "website_error", "tokens", "other"] as const;

const ContactSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(320),
  message: z.string().min(1).max(5000).trim(),
  privacyAccepted: z.preprocess(
    (v) => v === true || v === "on" || v === "true",
    z.boolean().refine((v) => Boolean(v), { message: "Politica de confidențialitate trebuie acceptată" })
  ),
  website: z.string().max(0).optional(), // honeypot
  subject: z.enum(SUBJECT_VALUES).optional(),
  companyName: z.string().max(200).trim().optional().or(z.literal("")),
});

type ContactInput = z.infer<typeof ContactSchema>;

const MSG_LENGTH = 5000;

function sanitize(str: string, maxLen: number): string {
  return str
    .replace(/[<>]/g, "")
    .slice(0, maxLen)
    .trim();
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: NextRequest) {
  const correlationId = randomUUID();

  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(ip, { maxRequests: 5, windowMs: 60000 });
    pruneStore();

    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "Prea multe solicitări. Încercați mai târziu." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "INVALID_JSON", error: "Corp invalid." },
        { status: 400 }
      );
    }

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Date invalide";
      return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", error: msg }, { status: 400 });
    }

    const { name, email, message, website, subject, companyName } = parsed.data as ContactInput & {
      website?: string;
      subject?: (typeof SUBJECT_VALUES)[number];
      companyName?: string;
    };
    if (website && website.length > 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const safeName = sanitize(name, 200);
    const safeMessage = sanitize(message, MSG_LENGTH);
    const safeCompany = companyName ? sanitize(companyName, 200) : null;

    // 1. Resend este obligatoriu — notificarea trebuie trimisă la contact@gobid.ro
    const resendApiKey =
      process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY || "";
    if (!resendApiKey) {
      return NextResponse.json(
        {
          ok: false,
          code: "RESEND_NOT_CONFIGURED",
          error: "Trimiterea prin Resend nu este configurată. Setează RESEND_API_KEY în .env.",
        },
        { status: 503 }
      );
    }

    const fromEmail =
      process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      "noreply@gobid.ro";
    const toEmail = "contact@gobid.ro";

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
      (process.env.NODE_ENV === "production" ? "https://gobid.ro" : "http://localhost:3000");

    const emailHtml = getContactFormNotificationEmail({
      name: safeName,
      email,
      subject: subject ?? "contact",
      companyName: safeCompany,
      message: safeMessage,
      baseUrl,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: `[gobid.ro] Mesaj contact: ${subject ?? "contact"} – ${safeName}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      console.error(`[contact:${correlationId}] Resend error:`, res.status, err);
      return NextResponse.json(
        {
          ok: false,
          code: "RESEND_ERROR",
          error: err?.message ?? "Eroare la trimiterea email-ului prin Resend.",
        },
        { status: 500 }
      );
    }

    // 2. După ce emailul a fost trimis cu Resend, salvez și în DB (opțional pentru răspuns)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
      const payload: Record<string, unknown> = {
        name: safeName,
        email,
        message: safeMessage,
        ip,
        user_agent: userAgent,
        status: "new",
        subject: subject ?? null,
        company_name: safeCompany,
      };
      const { error } = await supabase.from("contact_messages").insert(payload);
      if (error) {
        // Coloane subject/company_name lipsesc dacă migrarea n-a rulat — încearcă fără ele
        if (error.code === "42703") {
          const { error: err2 } = await supabase.from("contact_messages").insert({
            name: safeName,
            email,
            message: safeMessage,
            ip,
            user_agent: userAgent,
            status: "new",
          });
          if (err2) console.error(`[contact:${correlationId}] Supabase insert fallback error:`, err2.code);
        } else {
          console.error(`[contact:${correlationId}] Supabase insert error:`, error.code);
        }
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(`[contact:${correlationId}] Unexpected error`);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Eroare internă." },
      { status: 500 }
    );
  }
}
