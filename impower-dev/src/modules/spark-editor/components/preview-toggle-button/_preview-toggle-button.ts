import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./preview-toggle-button.html";

export default spec({
  tag: "se-preview-toggle-button",
  cache: WorkspaceCache,
  css,
  html,
});
