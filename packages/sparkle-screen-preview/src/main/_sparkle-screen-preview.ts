import animationCSS from "../../../sparkle/src/styles/animations/animations.css";
import themeDarkCSS from "../../../sparkle/src/styles/dark/dark.css";
import themeLightCSS from "../../../sparkle/src/styles/light/light.css";
import themeCSS from "../../../sparkle/src/styles/theme/theme.css";
import { spec } from "../../../spec-component/src/spec";
import defaultCSS from "./sparkle-screen-default.css";
import css from "./sparkle-screen-preview.css";
import html from "./sparkle-screen-preview.html";
import resetCSS from "./sparkle-screen-reset.css";

export default spec({
  tag: "sparkle-screen-preview",
  selectors: {
    state: "#state",
    renderButton: "#render-button",
    parsed: "#parsed",
    css: "#css",
    html: "#html",
  } as const,
  css: [
    resetCSS,
    themeCSS,
    themeDarkCSS,
    themeLightCSS,
    animationCSS,
    defaultCSS,
    css,
  ],
  html,
});
