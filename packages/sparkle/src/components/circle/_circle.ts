import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./circle.css";
import html from "./circle.html";

export default spec({
  tag: "s-circle",
  css: [...sharedCSS, css],
  html,
});
