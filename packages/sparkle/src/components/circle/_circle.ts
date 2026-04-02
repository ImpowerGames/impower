import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./circle.css";

export default spec({
  tag: "s-circle",
  shadowDOM: false,
  css,
  sharedCSS,
  props: {
    size: null as string | null,
  },
});
