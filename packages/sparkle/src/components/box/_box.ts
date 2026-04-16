import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./box.css";

export default spec({
  tag: "s-box",
  shadowDOM: false,
  selectors: {
    option: "s-option",
  },
  props: {
    key: null as string | null,
    active: null as string | null,
    open: false,
    anchorInteraction: "click" as "click" | "hover",
  },
  css,
  sharedCSS,
});
