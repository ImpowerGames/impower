import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./router.css";
import html from "./router.html";

export default spec({
  tag: "s-router",
  html,
  selectors: {
    oldFade: ".old-fade",
    oldTransform: ".old-transform",
    newFade: ".new-fade",
    newTransform: ".new-transform",
    headerTemplatesSlot: "slot[name=header-templates]",
    footerTemplatesSlot: "slot[name=footer-templates]",
  } as const,
  css: [...sharedCSS, css],
});
