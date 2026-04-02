import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./collapsible.css";

export default spec({
  tag: "s-collapsible",
  shadowDOM: false,
  selectors: {
    button: "s-button",
  } as const,
  css,
  sharedCSS,
  props: {
    collapsed: null as string | null,
    sentinel: null as string | null,
  },
});
