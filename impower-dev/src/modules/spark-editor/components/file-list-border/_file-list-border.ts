import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./file-list-border.html";

export default spec({
  tag: "se-file-list-border",
  stores: { workspace },
  html,
  css,
});
