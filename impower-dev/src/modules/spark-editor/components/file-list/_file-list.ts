import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./file-list.css";
import html from "./file-list.html";

export default spec({
  tag: "se-file-list",
  css: [...sharedCSS, css],
  props: {
    include: "",
    exclude: "",
    accept: "",
  },
  html,
});
