import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./badge.css";

export default spec({
  tag: "s-badge",
  shadowDOM: false,
  css,
  sharedCSS,
  props: {
    float: null as string | null,
  },
});
