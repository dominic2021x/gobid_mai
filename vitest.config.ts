import path from "node:path";
import { defineConfig } from "vitest/config";

/** Mirrors tsconfig paths: `"@/*": ["./*"]` so Vitest can resolve the same imports as Next.js. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
});
