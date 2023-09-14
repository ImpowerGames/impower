import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./logic-scripts-list.html";

export default spec({
  tag: "se-logic-scripts-list",
  context: WorkspaceContext.instance,
  css,
  html,
});
