import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./viewport.css";
import html from "./viewport.html";

export default spec({
  tag: "s-viewport",
  html,
  css: [...sharedCSS, css],
});
