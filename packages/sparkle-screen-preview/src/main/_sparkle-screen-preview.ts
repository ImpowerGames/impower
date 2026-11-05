/// <reference path="../declaration.d.ts" />
import previewDark from "./styles/dark.css";
import previewLight from "./styles/light.css";
import previewTheme from "./styles/theme.css";
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
