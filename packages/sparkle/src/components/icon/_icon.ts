import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./icon.css";
import html from "./icon.html";

export default spec({
  tag: "s-icon",
  css: [...sharedCSS, css],
  html,
});
