import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

export default spec({
  tag: "s-progress-bar",
  css: [...sharedCSS, css],
  html,
});
