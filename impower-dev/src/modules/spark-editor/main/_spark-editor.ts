import { spec } from "../../../../../packages/spec-component/src/spec";
import impowerUiTailwind from "@impower/impower-ui/style.css?inline";
import css from "../styles/core/core.css";
import sharedCSS from "../styles/shared";
import workspace from "../workspace/WorkspaceStore";
import html from "./spark-editor.html";

// Unlayered re-declarations for Tailwind utilities that get clobbered by
// sparkle's normalize.css universal-selector resets (which live in
// `@layer normalize`). Layered rules always lose to unlayered ones, so
// pulling these few utilities out of `@layer utilities` is how we win
// the cascade without touching sparkle. Add new ones here as we hit them.
const UNLAYERED_OVERRIDES = `
  /* Borders — sparkle's normalize.css resets border to 0/none. */
  .border { border-width: 1px; border-style: solid; }
  .border-solid { border-style: solid; }
  .border-0 { border-width: 0; }
  .border-2 { border-width: 2px; border-style: solid; }
  .border-t { border-top-width: 1px; border-top-style: solid; }
  .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
  .border-l { border-left-width: 1px; border-left-style: solid; }
  .border-r { border-right-width: 1px; border-right-style: solid; }

  /* Flex direction — sparkle's normalize.css declares
     * { flex-flow: column } which clobbers Tailwind's .flex-row, .flex-col,
     * etc. when their @layer utilities loses against the @layer normalize. */
  .flex-row { flex-direction: row; }
  .flex-col { flex-direction: column; }
  .flex-row-reverse { flex-direction: row-reverse; }
  .flex-col-reverse { flex-direction: column-reverse; }
  .flex-wrap { flex-wrap: wrap; }
  .flex-nowrap { flex-wrap: nowrap; }
`;

// Inline impower-ui's Tailwind as a <style> at the top of spark-editor's
// shadow template. The spec-component framework's connectedCallback flow is:
//   1. attachShadow
//   2. shadowRoot.replaceChildren(template)
//   3. loadCSS / loadSharedCSS (adopts constructable stylesheets)
// Between steps 2 and 3 the browser paints content that doesn't yet have its
// utility CSS, so Tailwind classes like `opacity-0` briefly don't apply —
// which made the bottom-nav's active-overlay icons (normally hidden via
// opacity-0) flash visible on all three tabs simultaneously during hydration.
// An inline <style> inside the template applies the moment the shadow root
// receives content, eliminating the gap.
export default spec({
  tag: "spark-editor",
  stores: { workspace },
  html: () =>
    `<style>${impowerUiTailwind}${UNLAYERED_OVERRIDES}</style>${html}`,
  selectors: {
    interactionBlocker: "",
  } as const,
  css,
  sharedCSS,
});
