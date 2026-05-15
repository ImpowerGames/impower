/// <reference types="node" />
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: !!process.env.PORT,
    fs: { strict: false },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
  // Luau.Web.js is a SINGLE_FILE emscripten build (wasm embedded as base64),
  // so we don't need any wasm asset handling. We just treat it as a side-effecting
  // module that attaches a Module factory to globalThis.
  optimizeDeps: {
    exclude: ["./src/wasm/Luau.Web.js"],
  },
});
