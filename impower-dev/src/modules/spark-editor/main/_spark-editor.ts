import { spec } from "../../../../../packages/spec-component/src/spec";
import impowerUiTailwind from "@impower/impower-ui/style.css?inline";
import css from "../styles/core/core.css";
import sharedCSS from "../styles/shared";
import workspace from "../workspace/WorkspaceStore";
import html from "./spark-editor.html";

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
  html: () => `<style>${impowerUiTailwind}</style>${html}`,
  selectors: {
    interactionBlocker: "",
  } as const,
  css,
  sharedCSS,
});
