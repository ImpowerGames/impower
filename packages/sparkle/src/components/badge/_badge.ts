import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./badge.css";
import html from "./badge.html";

export default spec({
  tag: "s-badge",
  css: [...sharedCSS, css],
  html,
});
