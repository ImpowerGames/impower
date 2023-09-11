import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./main-panel.css";
import html from "./main-panel.html";

export default spec({
  tag: "se-main-panel",
  css: [...sharedCSS, css],
  html,
});
