import { spec } from "../../../spec-component/src/spec";
import css from "./sparkdown-screen-preview.css";
import html from "./sparkdown-screen-preview.html";
import defaultCSS from "./sparkle-screen-default.css";
import resetCSS from "./sparkle-screen-reset.css";
import themeDarkCSS from "./sparkle-screen-theme-dark.css";
import themeLightCSS from "./sparkle-screen-theme-light.css";
import themeCSS from "./sparkle-screen-theme.css";
import utilityCSS from "./sparkle-screen-utility.css";

export default spec({
  tag: "sparkdown-screen-preview",
  selectors: {
    state: "#state",
    renderButton: "#render-button",
    parsed: "#parsed",
    styles: "#styles",
    output: "#output",
  } as const,
  css: [
    resetCSS,
    themeCSS,
    themeDarkCSS,
    themeLightCSS,
    defaultCSS,
    utilityCSS,
    css,
  ],
  html,
});
