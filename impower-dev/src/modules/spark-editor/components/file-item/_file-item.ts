import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./file-item.html";

export default spec({
  tag: "se-file-item",
  context: WorkspaceContext.instance,
  css,
  props: { filename: "" },
  html,
});
