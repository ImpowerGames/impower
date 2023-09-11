import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "./sparkdown-script-editor.css";
import html from "./sparkdown-script-editor.html";

export default spec({
  tag: "sparkdown-script-editor",
  css,
  props: { scrollMargin: "", autosaveThrottleDelay: 100 },
  html,
});
