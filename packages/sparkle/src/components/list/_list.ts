import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./list.css";
import html from "./list.html";

export default spec({
  tag: "s-list",
  html,
  css: [...sharedCSS, css],
});
