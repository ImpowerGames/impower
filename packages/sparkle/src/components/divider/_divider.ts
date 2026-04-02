import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./divider.css";

export default spec({
  tag: "s-divider",
  shadowDOM: false,
  css,
  sharedCSS,
  props: {
    vertical: null as string | null,
    size: null as string | null,
  },
});
