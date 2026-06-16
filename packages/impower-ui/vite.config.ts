import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    dts({ bundleTypes: true, tsconfigPath: "./tsconfig.app.json" }),
  ],
  build: {
    lib: {
      entry: "src/components/index.ts",
      name: "impower-ui",
      // ES-only: the sole consumer (impower-dev) imports via the "import"
      // condition. Dropping the UMD output avoids the externals-need-globals
      // dance below.
      formats: ["es"],
    },
    rollupOptions: {
      // Externalize the Preact family so the dist does NOT bundle its own
      // copy of Preact. A second Preact instance makes hook dispatch read the
      // wrong component instance ("Cannot read properties of undefined
      // (reading '__H')") and blanks the page in production. The consumer
      // (impower-dev) provides and dedupes a single Preact. radix / CVA /
      // clsx / react-resizable-panels stay bundled (already mapped to
      // preact/compat by @preact/preset-vite during this build).
      external: (id) =>
        /^preact(\/|$)/.test(id) ||
        /^@preact\//.test(id) ||
        id === "preact-custom-element",
    },
  },
});
