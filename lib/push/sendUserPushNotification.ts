import { supabaseAdmin } from "@/lib/supabase";
import { JWT } from "google-auth-library";
import { readFileSync } from "fs";
import { resolve } from "path";

type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getServiceAccountFromEnv(): FirebaseServiceAccount | null {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  const pathEnv = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH || "").trim();
  if (pathEnv && !raw.trim()) {
    try {
      const absPath = resolve(process.cwd(), pathEnv);
      raw = readFileSync(absPath, "utf8");
    } catch {
      return null;
    }
  }
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

async function sendViaFcmV1(
  serviceAccount: FirebaseServiceAccount,
  token: string,
  payload: PushPayload,
  badgeCount: number
): Promise<{ ok: boolean; deactivateToken: boolean }> {
  try {
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const { access_token } = await client.authorize();
    if (!access_token) return { ok: false, deactivateToken: false };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              ...(payload.data || {}),
              badgeCount: String(badgeCount),
            },
            android: {
              priority: "HIGH",
              notification: {
                sound: "default",
                channel_id: "default",
                notification_count: badgeCount,
                default_vibrate_timings: true,
                default_sound: true,
                visibility: "PUBLIC",
                notification_priority: "PRIORITY_HIGH",
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                  badge: badgeCount,
                },
              },
            },
          },
        }),
      }
    );

    if (res.ok) return { ok: true, deactivateToken: false };
    const errText = await res.text().catch(() => "");
    const upper = errText.toUpperCase();
    const deactivateToken =
      upper.includes("UNREGISTERED") ||
      upper.includes("NOTREGISTERED") ||
      upper.includes("INVALID_REGISTRATION") ||
      upper.includes("INVALID_ARGUMENT");
    return { ok: false, deactivateToken };
  } catch {
    return { ok: false, deactivateToken: false };
  }
}

/**
 * Trimite push notification prin FCM legacy, dacă FCM_SERVER_KEY este configurat.
 * Dacă nu există configurare, funcția iese silențios (fără a bloca fluxul principal).
 */
export async function sendUserPushNotification(payload: PushPayload): Promise<void> {
  if (!supabaseAdmin) return;
  const admin = supabaseAdmin;
  const serviceAccount = getServiceAccountFromEnv();
  const legacyServerKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY || "";
  if (!serviceAccount && !legacyServerKey) return;

  const { data: rows, error } = await admin
    .from("user_push_tokens")
    .select("id, push_token, platform, is_active")
    .eq("user_id", payload.userId)
    .eq("is_active", true);

  if (error || !rows || rows.length === 0) return;

  const tokens = rows
    .map((r: any) => String(r?.push_token || "").trim())
    .filter(Boolean);

  if (tokens.length === 0) return;

  // Number shown on app icon / payload for clients that support badges.
  const { count: unreadCount } = await admin
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", payload.userId)
    .is("read_at", null);
  const badgeCount = Math.max(0, Number(unreadCount || 0));

  await Promise.all(
    tokens.map(async (token) => {
      try {
        // Preferă FCM v1 (service account JSON single-env), fallback la legacy key.
        if (serviceAccount) {
          const v1 = await sendViaFcmV1(serviceAccount, token, payload, badgeCount);
          if (v1.deactivateToken) {
            await admin
              .from("user_push_tokens")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("push_token", token);
          }
          return;
        }

        const res = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `key=${legacyServerKey}`,
          },
          body: JSON.stringify({
            to: token,
            priority: "high",
            notification: {
              title: payload.title,
              body: payload.body,
              sound: "default",
              badge: badgeCount,
            },
            data: {
              ...(payload.data || {}),
              badgeCount: String(badgeCount),
            },
          }),
        });

        if (!res.ok) return;
        const json: any = await res.json().catch(() => null);
        const result = Array.isArray(json?.results) ? json.results[0] : null;
        if (result?.error && ["InvalidRegistration", "NotRegistered"].includes(result.error)) {
          await admin
            .from("user_push_tokens")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("push_token", token);
        }
      } catch {
        // Silent fail: notificarea push nu trebuie să blocheze fluxul.
      }
    })
  );
}

