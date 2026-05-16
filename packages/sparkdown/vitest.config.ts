import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Discover sparkdown's own tests under src/. Explicitly exclude the
    // vendored inkjs upstream tests — those target the upstream inkjs
    // API which differs from sparkdown's runtime (no scene/branch, no
    // Luau methods, different operator precedence). They're kept on
    // disk as reference material only; see
    // `inkjs-upstream-tests/VENDORING.md`.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "src/inkjs/tests/**",
    ],
  },
});
