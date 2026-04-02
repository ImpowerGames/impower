import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./transition.css";

export default spec({
  tag: "s-transition",
  shadowDOM: false,
  css,
  sharedCSS,
  props: {
    router: null as string | null,
  },
});
