import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./file-list-border.html";

export default spec({
  tag: "se-file-list-border",
  context: WorkspaceContext.instance,
  css,
  html,
});
