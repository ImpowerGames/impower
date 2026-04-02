import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./skeleton.css";

export default spec({
  tag: "s-skeleton",
  shadowDOM: false,
  css,
  sharedCSS,
  props: {
    sheenColor: null as string | null,
  },
});
