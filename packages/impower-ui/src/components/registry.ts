import type { FunctionComponent } from "preact";
import Icon from "./icon/Icon";

// Source of truth: tag name → Preact component for build-time SSR expansion.
// Add a new entry when registering a new custom element via PreactComponent.
//
// Server-safe: this module does NOT import any .elem.ts (which would call
// customElements.define and break in Node). Only Preact components live here.
export const componentRegistry: Record<string, FunctionComponent<any>> = {
  "s-icon": Icon,
};
