import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react(-dom)?$/, replacement: "preact/compat" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
    ],
    mainFields: ["module", "main"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
    server: {
      deps: {
        inline: [
          /@radix-ui\//,
          /@floating-ui\/react-dom/,
          /react-remove-scroll/,
          /react-style-singleton/,
          /use-callback-ref/,
          /use-sidecar/,
        ],
      },
    },
  },
});
