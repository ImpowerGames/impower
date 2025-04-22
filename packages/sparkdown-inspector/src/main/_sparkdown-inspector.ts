import { spec } from "../../../spec-component/src/spec";
import css from "./sparkdown-inspector.css";
import html from "./sparkdown-inspector.html";

export default spec({
  tag: "sparkdown-inspector",
  selectors: {
    editor: "#editor",
  } as const,
  css,
  html,
});
