import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-options-button.html";

export default spec({
  tag: "se-file-options-button",
  cache: WorkspaceCache,
  css,
  html,
});
