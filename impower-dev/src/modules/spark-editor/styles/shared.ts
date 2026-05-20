import baseNormalize from "../../../../../packages/spec-component/src/styles/normalize/normalize.css";
import editorNormalize from "../styles/normalize/normalize.css";
// Adopt impower-ui's Tailwind into every spec-component shadow root that
// uses sharedCSS, so Preact-rendered children inside those shadow roots
// (e.g. the new <se-preview-game-toolbar> sitting inside the legacy
// <se-preview-game>) have utility classes available. The CSSStyleSheet
// is cache-shared via spec-component's Styles cache, so even though many
// shadow roots adopt it, the rules are stored once.
import impowerUiTailwind from "@impower/impower-ui/style.css?inline";
import tailwindUnlayered from "./tailwind-unlayered.css";

export default {
  baseNormalize,
  editorNormalize,
  impowerUiTailwind,
  tailwindUnlayered,
};
