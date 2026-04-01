import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tabs.css";
import html from "./tabs.html";

export default spec({
  tag: "s-tabs",
  html,
  selectors: {
    indicator: ".indicator",
    nav: ".nav",
    tab: "s-tab",
  } as const,
  css,
  sharedCSS,
  props: {
    key: null as string | null,
    indicator: null as string | null,
    vertical: null as string | null,
    active: null as string | null,
    indicatorWidth: null as string | null,
    indicatorColor: null as string | null,
  },
});
