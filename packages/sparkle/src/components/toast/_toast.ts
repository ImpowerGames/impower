import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./toast.css";
import html from "./toast.html";

export default spec({
  tag: "s-toast",
  html,
  selectors: {
    button: ".button",
    close: ".close",
    actionSlot: "slot[name=action]",
  } as const,
  css: [...sharedCSS, css],
});
