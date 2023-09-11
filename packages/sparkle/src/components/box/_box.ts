import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./box.css";
import html from "./box.html";

export default spec({
  tag: "s-box",
  css: [...sharedCSS, css],
  html,
});
