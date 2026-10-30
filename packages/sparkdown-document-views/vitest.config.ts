import { defineConfig } from "vitest/config";

// workaround(@codemirror/state): duplicate copies across file: deps fail instanceof checks with Unrecognized extension value errors
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
  resolve: { dedupe: SHARED_PACKAGES },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    pool: "threads",
    testTimeout: 30_000,
  },
});
