import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./ripple.css";
import html from "./ripple.html";

export default spec({
  tag: "s-ripple",
  html,
  css: [...sharedCSS, css],
});
