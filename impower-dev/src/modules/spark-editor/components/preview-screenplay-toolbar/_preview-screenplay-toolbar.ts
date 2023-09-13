import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./preview-screenplay-toolbar.html";

export default spec({
  tag: "se-preview-screenplay-toolbar",
  cache: WorkspaceCache,
  css,
  html,
});
