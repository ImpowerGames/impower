import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./divider.css";
import html from "./divider.html";

export default spec({
  tag: "s-divider",
  html,
  css,
  sharedCSS,
  props: {
    vertical: null as string | null,
    size: null as string | null,
  },
});
