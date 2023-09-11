import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./toast.css";
import html from "./toast.html";

export default spec({
  tag: "s-toast",
  css: [...sharedCSS, css],
  html,
});
