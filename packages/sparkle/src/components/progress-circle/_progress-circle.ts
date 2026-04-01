import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

export default spec({
  tag: "s-progress-circle",
  html,
  selectors: {
    indicator: ".indicator",
    label: ".label",
  } as const,
  css,
  sharedCSS,
  props: {
    value: null as string | null,
    size: null as string | null,
    trackWidth: null as string | null,
    indicatorWidth: null as string | null,
    speed: null as string | null,
  },
});
