import { defineConfig } from "vitest/config";

// workaround(@codemirror/state): duplicate copies across file: deps fail instanceof checks with Unrecognized extension value errors (seen with @codemirror/state 6.6.0)
const SHARED_PACKAGES = [
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
];

export default defineConfig({
  resolve: {
    dedupe: SHARED_PACKAGES,
    alias: [
      { find: /^react(-dom)?$/, replacement: "preact/compat" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
    ],
    mainFields: ["module", "main"],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    pool: "threads",
    testTimeout: 30_000,
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
