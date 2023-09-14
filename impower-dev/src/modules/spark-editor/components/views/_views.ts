import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./views.html";

export default spec({
  tag: "se-views",
  context: WorkspaceContext.instance,
  css,
  html,
});
