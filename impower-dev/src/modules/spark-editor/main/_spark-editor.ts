import { spec } from "../../../../../packages/spec-component/src/spec";
import css from "../styles/shared";
import WorkspaceContext from "../workspace/WorkspaceContext";
import html from "./spark-editor.html";

export default spec({
  tag: "spark-editor",
  context: WorkspaceContext.instance,
  css,
  html,
});
