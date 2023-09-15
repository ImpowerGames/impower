import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./split-pane.css";
import html from "./split-pane.html";

export default spec({
  tag: "s-split-pane",
  html,
  selectors: {
    resize: ".resize",
    divider: ".divider",
  } as const,
  css: [...sharedCSS, css],
});
