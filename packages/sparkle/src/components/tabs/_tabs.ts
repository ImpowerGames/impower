import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tabs.css";
import html from "./tabs.html";

export default spec({
  tag: "s-tabs",
  css: [...sharedCSS, css],
  html,
});
