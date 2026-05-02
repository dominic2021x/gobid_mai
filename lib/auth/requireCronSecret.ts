import "server-only";

export async function requireCronSecret(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;

  // optional: allow internal header too (for your own tooling)
  const legacy = req.headers.get("x-cron-secret");

  const secret = token ?? legacy;

  if (!secret || secret !== process.env.CRON_SECRET) {
    throw new Error("Unauthorized");
  }
}
