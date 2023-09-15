import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tab.css";
import html from "./tab.html";

export default spec({
  tag: "s-tab",
  html,
  selectors: {
    ripple: "s-ripple",
    label: ".label",
    icon: ".icon",
    inactiveIcon: ".inactive-icon",
    activeIcon: ".active-icon",
  } as const,
  css: [...sharedCSS, css],
});
