import type { ReactNode } from "react";

/**
 * Presentational wrapper for the main listings column (no hooks — safe to nest under Server or Client trees).
 */
export function RoListView({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ro-list-view min-w-0 flex-1 ${className}`.trim()}>{children}</div>;
}
