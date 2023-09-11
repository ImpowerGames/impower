import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tab.css";
import html from "./tab.html";

export default spec({
  tag: "s-tab",
  css: [...sharedCSS, css],
  html,
});
