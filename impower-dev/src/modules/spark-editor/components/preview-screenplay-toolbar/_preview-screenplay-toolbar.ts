import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./preview-screenplay-toolbar.html";

export default spec({
  tag: "se-preview-screenplay-toolbar",
  context: WorkspaceContext.instance,
  css,
  html,
});
