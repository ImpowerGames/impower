import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./scroll-blocker.css";
import html from "./scroll-blocker.html";

export default spec({
  tag: "s-scroll-blocker",
  html,
  css: [...sharedCSS, css],
});
