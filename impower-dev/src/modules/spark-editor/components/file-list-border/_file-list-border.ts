import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-list-border.html";

export default spec({
  tag: "se-file-list-border",
  cache: WorkspaceCache,
  css,
  html,
});
