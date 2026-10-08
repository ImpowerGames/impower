import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Layer 1 DOM-render golden runs the real UIManager against jsdom.
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Statement chunks and the program engine unless a test says otherwise
    // (#705; the file says why).
    setupFiles: ["src/tests/programChunksByDefault.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
  },
});
