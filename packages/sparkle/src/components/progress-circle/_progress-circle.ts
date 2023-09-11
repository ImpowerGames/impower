import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

export default spec({
  tag: "s-progress-circle",
  css: [...sharedCSS, css],
  html,
});
