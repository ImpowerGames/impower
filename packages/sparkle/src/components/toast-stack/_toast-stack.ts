import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./toast-stack.css";
import html from "./toast-stack.html";

export default spec({
  tag: "s-toast-stack",
  html,
  selectors: {
    toast: "s-toast",
  } as const,
  css: [...sharedCSS, css],
});
