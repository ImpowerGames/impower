import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Statement chunks and the program engine unless a test says otherwise
    // (#705; the file says why).
    setupFiles: ["src/tests/programChunksByDefault.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
