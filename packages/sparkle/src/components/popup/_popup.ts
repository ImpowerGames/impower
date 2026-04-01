import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import { Placement, Strategy } from "./floating-ui/core";
import css from "./popup.css";
import html from "./popup.html";

export default spec({
  tag: "s-popup",
  html,
  props: {
    open: false,
    anchor: null as string | null,
    placement: null as Placement | null,
    strategy: null as Strategy | null,
    distance: null as number | null,
    skidding: null as number | null,
    arrow: null as string | null,
    arrowPlacement: null as string | null,
    arrowPadding: null as string | null,
    disableAutoFlip: null as string | null,
    flipFallbackPlacements: null as string | null,
    flipFallbackStrategy: null as string | null,
    flipBoundary: null as string | null,
    flipPadding: null as number | null,
    disableAutoShift: null as string | null,
    shiftBoundary: null as string | null,
    shiftPadding: null as number | null,
    autoSize: null as string | null,
    syncSize: null as string | null,
    autoSizeBoundary: null as string | null,
    autoSizePadding: null as number | null,
  },
  selectors: {
    popup: ".popup",
  } as const,
  css,
  sharedCSS,
});
