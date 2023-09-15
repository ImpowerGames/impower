import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./file-editor-navigation.html";

export default spec({
  tag: "se-file-editor-navigation",
  stores: { workspace },
  html,
  css,
});
