import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-add-button.html";

export default spec({
  tag: "se-file-add-button",
  cache: WorkspaceCache,
  css,
  props: { filename: "" },
  html,
});
