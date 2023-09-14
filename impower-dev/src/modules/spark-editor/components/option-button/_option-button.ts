import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./option-button.html";

export default spec({
  tag: "se-option-button",
  context: WorkspaceContext.instance,
  css,
  html,
});
