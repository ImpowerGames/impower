import animationCSS from "../../../sparkle/src/styles/animations/animations.css";
import themeDarkCSS from "../../../sparkle/src/styles/dark/dark.css";
import themeLightCSS from "../../../sparkle/src/styles/light/light.css";
import themeCSS from "../../../sparkle/src/styles/theme/theme.css";
import utilityCSS from "../../../sparkle/src/styles/utility/utility.css";
import { spec } from "../../../spec-component/src/spec";
import css from "./sparkdown-screen-preview.css";
import html from "./sparkdown-screen-preview.html";
import defaultCSS from "./sparkle-screen-default.css";
import resetCSS from "./sparkle-screen-reset.css";

export default spec({
  tag: "sparkdown-screen-preview",
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
    utilityCSS,
    css,
  ],
  html,
});
