import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import css from "./preview-panel.css";
import html from "./preview-panel.html";

export default spec({
  tag: "se-preview-panel",
  context: WorkspaceContext.instance,
  css: [...sharedCSS, css],
  html,
});
