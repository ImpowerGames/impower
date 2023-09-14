import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./file-options-button.html";

export default spec({
  tag: "se-file-options-button",
  context: WorkspaceContext.instance,
  css,
  html,
});
