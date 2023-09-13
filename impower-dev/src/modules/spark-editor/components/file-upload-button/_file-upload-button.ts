import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-upload-button.html";

export default spec({
  tag: "se-file-upload-button",
  cache: WorkspaceCache,
  css,
  html,
});
