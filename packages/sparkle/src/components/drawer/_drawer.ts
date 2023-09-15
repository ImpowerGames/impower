import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./drawer.css";
import html from "./drawer.html";

export default spec({
  tag: "s-drawer",
  html,
  css: [...sharedCSS, css],
});
