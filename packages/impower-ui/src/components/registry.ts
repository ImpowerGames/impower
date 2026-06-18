import type { FunctionComponent } from "preact";

// Tag name → Preact component for the build-time SSR walker. Only major
// embedded blocks (code editor, screenplay viewer, game preview) are
// custom-element-wrapped — atomic UI (Button, Icon, etc.) is used directly via
// JSX in pages. This registry stays empty until those big blocks are ported.
//
// Server-safe: does NOT import any .elem.ts (which would call
// customElements.define and fail in Node).
export const componentRegistry: Record<string, FunctionComponent<any>> = {};
