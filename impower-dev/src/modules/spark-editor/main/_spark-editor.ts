import { spec } from "../../../../../packages/spec-component/src/spec";
import css from "../styles/shared";
import { WorkspaceCache } from "../workspace/WorkspaceCache";
import html from "./spark-editor.html";

export default spec({
  tag: "spark-editor",
  cache: WorkspaceCache,
  css,
  html,
});
