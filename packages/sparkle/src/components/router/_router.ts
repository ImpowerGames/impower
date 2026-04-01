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
  css,
  sharedCSS,
  props: {
    key: null as string | null,
    active: null as string | null,
    enterEvent: null as string | null,
    exitEvent: null as string | null,
    eventSource: null as string | null,
    swipeable: null as string | null,
    directional: null as string | null,
    unmount: null as string | null,
  },
});
