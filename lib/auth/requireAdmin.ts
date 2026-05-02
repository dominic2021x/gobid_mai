import "server-only";
import { requireAdmin as requireAdminBase } from "@/lib/adminAuth";

/** Admin-only: throws if not admin. Use in API routes: await requireAdmin(req); then return response on success. */
export async function requireAdmin(req: Request) {
  const auth = await requireAdminBase(req as any);
  if (!auth.ok) {
    throw new Error(auth.response?.status === 401 ? "Unauthorized" : "Forbidden");
  }
}
