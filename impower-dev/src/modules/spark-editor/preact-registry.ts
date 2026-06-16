import type { ComponentRegistry } from "../../build/expandPreactComponents";
import SparkEditor from "./main/SparkEditor";

// Tag name → Preact component for the build-time SSR walker.
//
// Only `<spark-editor>` (the page root in pages/index.html) needs walker
// substitution. Everything else is rendered as a direct Preact import
// from SparkEditor's tree, so the walker reaches them transitively via
// renderToString.
//
// Pure runtime-free entries: this module is loaded both in the browser
// AND during SSR (via Vite's ssrLoadModule). Only import the Preact .tsx
// files here — never the .elem.ts wrappers, which call
// `customElements.define` at import time and would explode in Node.
export const preactRegistry: ComponentRegistry = {
  "spark-editor": SparkEditor,
};
