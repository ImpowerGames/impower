import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./skeleton.css";
import html from "./skeleton.html";

export default spec({
  tag: "s-skeleton",
  html,
  css: [...sharedCSS, css],
});
