import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import html from "./file-item.html";

export default spec({
  tag: "se-file-item",
  css,
  props: { filename: "" },
  html,
});
