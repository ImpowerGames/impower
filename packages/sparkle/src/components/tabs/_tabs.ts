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
  css: [...sharedCSS, css],
});
