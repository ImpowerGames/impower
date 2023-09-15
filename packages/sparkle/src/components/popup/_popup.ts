import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./popup.css";
import html from "./popup.html";

export default spec({
  tag: "s-popup",
  html,
  selectors: {
    popup: ".popup",
  } as const,
  css: [...sharedCSS, css],
});
