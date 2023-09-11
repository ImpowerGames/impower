import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tooltip.css";
import html from "./tooltip.html";

export default spec({
  tag: "s-tooltip",
  css: [...sharedCSS, css],
  html,
});
