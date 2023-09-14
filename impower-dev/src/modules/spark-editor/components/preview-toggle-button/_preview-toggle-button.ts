import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./preview-toggle-button.html";

export default spec({
  tag: "se-preview-toggle-button",
  context: WorkspaceContext.instance,
  css,
  html,
});
