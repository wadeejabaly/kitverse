import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest needs the same `@/*` → `src/*` alias tsconfig gives the app, so a
 * test can import the modules under test exactly as the application does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
