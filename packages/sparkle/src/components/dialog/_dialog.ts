import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./dialog.css";
import html from "./dialog.html";

export default spec({
  tag: "s-dialog",
  css: [...sharedCSS, css],
  html,
});
