import previewDark from "../../../sparkle/src/styles/dark/dark.css";
import previewLight from "../../../sparkle/src/styles/light/light.css";
import previewTheme from "../../../sparkle/src/styles/theme/theme.css";
import { spec } from "../../../spec-component/src/spec";
import previewDefault from "./sparkle-screen-default.css";
import css from "./sparkle-screen-preview.css";
import html from "./sparkle-screen-preview.html";
import previewReset from "./sparkle-screen-reset.css";

export default spec({
  tag: "sparkle-screen-preview",
  selectors: {
    state: "#state",
    renderButton: "#render-button",
    parsed: "#parsed",
    css: "#css",
    html: "#html",
  } as const,
  css,
  sharedCSS: {
    previewReset,
    previewDark,
    previewLight,
    previewTheme,
    previewDefault,
  },
  html,
});
