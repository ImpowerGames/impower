import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./split-pane.css";
import html from "./split-pane.html";

export default spec({
  tag: "s-split-pane",
  html,
  selectors: {
    resize: ".resize",
    divider: ".divider",
  } as const,
  css,
  sharedCSS,
  props: {
    vertical: null as string | null,
    responsive: null as string | null,
    primary: null as string | null,
    reveal: false,
    revealEvent: null as string | null,
    unrevealEvent: null as string | null,
    minPanelWidth: null as string | null,
    minPanelHeight: null as string | null,
    resizerColor: null as string | null,
    resizerWidth: null as string | null,
    dividerColor: null as string | null,
    dividerOpacity: null as string | null,
    dividerOffset: null as string | null,
    dividerWidth: null as string | null,
    indicatorColor: null as string | null,
    indicatorWidth: null as string | null,
    initialSize: null as string | null,
    step: null as string | null,
  },
});
