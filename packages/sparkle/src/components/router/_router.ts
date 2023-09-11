import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./router.css";
import html from "./router.html";

export default spec({
  tag: "s-router",
  css: [...sharedCSS, css],
  html,
});
