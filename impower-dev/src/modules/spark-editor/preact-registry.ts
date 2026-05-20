import type { ComponentRegistry } from "../../build/expandPreactComponents";
import HeaderNavigation from "./components/header-navigation/HeaderNavigation";
import MainWindow from "./components/main-window/MainWindow";

// Tag name → Preact component for the build-time SSR walker.
//
// Pure runtime-free entries: this module is loaded both in the browser AND
// during SSR (via Vite's ssrLoadModule). Only import the Preact .tsx files
// here — never the .elem.ts wrappers, which call `customElements.define` at
// import time and would explode in Node.
export const preactRegistry: ComponentRegistry = {
  "se-main-window": MainWindow,
  "se-header-navigation": HeaderNavigation,
};
