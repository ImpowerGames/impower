import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  resolve: {
    alias: [
      { find: /^react(-dom)?$/, replacement: "preact/compat" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
    ],
    mainFields: ["module", "main"],
  },
  test: {
    include: ["src/**/*.test.tsx", "test/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    pool: "forks",
    fileParallelism: false,
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
