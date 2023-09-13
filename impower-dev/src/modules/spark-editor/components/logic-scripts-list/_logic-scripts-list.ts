import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./logic-scripts-list.html";

export default spec({
  tag: "se-logic-scripts-list",
  cache: WorkspaceCache,
  css,
  html,
});
