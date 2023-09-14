import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./widgets.html";

export default spec({
  tag: "se-widgets",
  context: WorkspaceContext.instance,
  css,
  html,
});
