import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./navigation.css";
import html from "./navigation.html";

export default spec({
  tag: "s-navigation",
  html,
  css: [...sharedCSS, css],
});
