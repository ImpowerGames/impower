import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { markdownHtmlPlugin } from "./src/build/markdownHtml";

export default defineConfig({
  plugins: [markdownHtmlPlugin()],
  resolve: {
    alias: [
      {
        find: "vscode-jsonrpc/browser",
        replacement: fileURLToPath(new URL("../node_modules/vscode-jsonrpc/lib/browser/main.js", import.meta.url)),
      },
      { find: /^react(-dom)?$/, replacement: "preact/compat" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
    ],
    mainFields: ["module", "main"],
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**"],
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
