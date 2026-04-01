import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

export default spec({
  tag: "s-progress-bar",
  html,
  css,
  sharedCSS,
  props: {
    value: null as string | null,
    trackWidth: null as string | null,
    indicatorWidth: null as string | null,
    speed: null as string | null,
  },
});
