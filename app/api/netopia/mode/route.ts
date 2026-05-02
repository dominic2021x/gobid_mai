/**
 * GET /api/netopia/mode
 * Returnează modul Netopia activ (Test sau Live).
 * Folosit de frontend pentru a afișa „Mod Test” pe site.
 */

import { resolveNetopiaConfig } from '@/lib/netopia-config';
import { paymentJson } from '@/lib/payment-http';
import {
  buildLastKnownGoodSnapshotKey,
  readFreshLastKnownGoodSnapshot,
  rememberLastKnownGoodSnapshot,
  shouldUseLastKnownGoodSnapshot,
} from '@/lib/server/lastKnownGoodSnapshot';
import { getOrLoadFromSharedTtlCache } from '@/lib/server/sharedTtlCache';

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type NetopiaModePayload = {
  testMode: boolean;
  env: "sandbox" | "live";
  stale?: true;
  snapshotAgeMs?: number;
};

const NETOPIA_MODE_SNAPSHOT_TTL_MS = 60_000;
const NETOPIA_MODE_SNAPSHOT_NAMESPACE = "api:netopia-mode";
const NETOPIA_MODE_SNAPSHOT_KEY = buildLastKnownGoodSnapshotKey({
  route: "/api/netopia/mode",
});
const NETOPIA_MODE_CACHE_TTL_MS = 60_000;
const NETOPIA_MODE_CACHE_NAMESPACE = "cache:api:netopia-mode";

export async function GET() {
  try {
    const { value: payload } = await getOrLoadFromSharedTtlCache<NetopiaModePayload>(
      NETOPIA_MODE_CACHE_NAMESPACE,
      NETOPIA_MODE_SNAPSHOT_KEY,
      {
        ttlMs: NETOPIA_MODE_CACHE_TTL_MS,
        loader: async () => {
          const resolved = await resolveNetopiaConfig();
          const nextPayload: NetopiaModePayload = {
            testMode: resolved.config.testMode,
            env: resolved.config.env,
          };

          if (resolved.readError) {
            throw Object.assign(new Error(resolved.readError.message || "netopia-mode failed"), resolved.readError, {
              fallbackPayload: nextPayload,
            });
          }

          rememberLastKnownGoodSnapshot(NETOPIA_MODE_SNAPSHOT_NAMESPACE, NETOPIA_MODE_SNAPSHOT_KEY, nextPayload);
          return nextPayload;
        },
      },
    );

    return paymentJson(payload);
  } catch (error) {
    if (shouldUseLastKnownGoodSnapshot(error)) {
      const snapshot = readFreshLastKnownGoodSnapshot<NetopiaModePayload>(
        NETOPIA_MODE_SNAPSHOT_NAMESPACE,
        NETOPIA_MODE_SNAPSHOT_KEY,
        NETOPIA_MODE_SNAPSHOT_TTL_MS,
      );
      if (snapshot) {
        return paymentJson({ ...snapshot.value, stale: true, snapshotAgeMs: snapshot.ageMs });
      }
      const fallbackPayload =
        error && typeof error === "object" && "fallbackPayload" in error
          ? (error as { fallbackPayload?: NetopiaModePayload }).fallbackPayload
          : null;
      return paymentJson(fallbackPayload ?? { testMode: false, env: 'live' });
    }

    return paymentJson({ error: "netopia-mode failed" }, { status: 500 });
  }
}
