import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./header-menu-button.html";

export default spec({
  tag: "se-header-menu-button",
  context: WorkspaceContext.instance,
  css,
  html,
});
