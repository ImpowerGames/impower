import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./file-add-button.html";

export default spec({
  tag: "se-file-add-button",
  context: WorkspaceContext.instance,
  css,
  props: { filename: "" },
  html,
});
