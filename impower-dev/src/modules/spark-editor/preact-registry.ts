import type { ComponentType } from "preact";
import SparkEditor from "./main/SparkEditor";

// The page-root Preact component, loaded by the build-time SSR (the dev
// server's `ssrLoadModule`) to pre-render `<div id="root">` so the page is
// painted before JS loads.
//
// Import ONLY the pure .tsx component here — never the runtime bootstrap
// (`./index.ts`, which touches `document`) or browser-only modules, since
// this module is evaluated in Node during SSR.
export const rootComponent: ComponentType = SparkEditor;
