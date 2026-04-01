import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./tooltip.css";
import html from "./tooltip.html";

export default spec({
  tag: "s-tooltip",
  html,
  css,
  sharedCSS,
  props: {
    label: null as string | null,
    trigger: null as string | null,
    showDelay: null as string | null,
    hideDelay: null as string | null,
  },
});
