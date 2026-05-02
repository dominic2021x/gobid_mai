/**
 * One-shot focal detection for uploaded_images (async worker only).
 * Uses OpenAI vision when OPENAI_API_KEY is set; otherwise returns null (no-op).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function parseJsonObject(text: string): { focal_x?: unknown; focal_y?: unknown } | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as { focal_x?: unknown; focal_y?: unknown };
  } catch {
    return null;
  }
}

/**
 * Returns normalized focal center (0–1) or null if skipped / failed.
 */
export async function detectFocalPointFromImageBuffer(
  buffer: Buffer,
  mime: string,
): Promise<{ focal_x: number; focal_y: number } | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || buffer.length === 0) return null;

  const safeMime = mime.startsWith("image/") ? mime : "image/jpeg";
  const b64 = buffer.toString("base64");
  const dataUrl = `data:${safeMime};base64,${b64}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Return ONLY JSON: {"focal_x":number,"focal_y":number} — center of the main subject, each in [0,1] from left (focal_x) and top (focal_y). If unsure use 0.5 for both.',
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 80,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.error("[focal] OpenAI HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonObject(content);
    if (!parsed || typeof parsed.focal_x !== "number" || typeof parsed.focal_y !== "number") {
      console.error("[focal] bad JSON", content.slice(0, 200));
      return null;
    }

    return {
      focal_x: clamp01(parsed.focal_x),
      focal_y: clamp01(parsed.focal_y),
    };
  } catch (e) {
    console.error("[focal] detect", e);
    return null;
  }
}

/**
 * Persists focal on `uploaded_images` when still null (run AI at most once per row).
 */
export async function tryDetectAndStoreFocalForUploadedImage(
  db: SupabaseClient,
  uploadedImageId: string,
  buffer: Buffer,
  mime: string,
): Promise<void> {
  const { data: row, error: selErr } = await db
    .from("uploaded_images")
    .select("id, focal_x, focal_y")
    .eq("id", uploadedImageId)
    .maybeSingle();

  if (selErr || !row) return;
  if (row.focal_x != null && row.focal_y != null) return;

  const focal = await detectFocalPointFromImageBuffer(buffer, mime);
  if (!focal) return;

  const { error: upErr } = await db
    .from("uploaded_images")
    .update({
      focal_x: focal.focal_x,
      focal_y: focal.focal_y,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uploadedImageId)
    .is("focal_x", null);

  if (upErr) {
    console.error("[focal] update uploaded_images", upErr);
  }
}
