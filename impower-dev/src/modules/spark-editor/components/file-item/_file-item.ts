import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./file-item.html";

export default spec({
  tag: "se-file-item",
  cache: WorkspaceCache,
  css,
  props: { filename: "" },
  html,
});
