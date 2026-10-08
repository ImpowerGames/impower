import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Layer 1 DOM-render golden runs the real UIManager against jsdom.
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
  },
});
