import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./collapsible.css";
import html from "./collapsible.html";

export default spec({
  tag: "s-collapsible",
  html,
  selectors: {
    button: "s-button",
  } as const,
  css: [...sharedCSS, css],
});
