import type { ReactNode } from "react";

/**
 * Renders children. Admin access is enforced by the parent admin layout (/admin).
 * Use this wrapper only if you need a named boundary; otherwise the layout already gates access.
 */
export default function AdminGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
