import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-editor-navigation.html";

export default spec({
  tag: "se-file-editor-navigation",
  cache: WorkspaceCache,
  css,
  html,
});
