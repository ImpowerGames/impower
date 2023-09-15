import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./transition.css";
import html from "./transition.html";

export default spec({
  tag: "s-transition",
  html,
  css: [...sharedCSS, css],
});
