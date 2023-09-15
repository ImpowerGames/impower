import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./preview-panel.css";
import html from "./preview-panel.html";

export default spec({
  tag: "se-preview-panel",
  stores: { workspace },
  html,
  css: [...sharedCSS, css],
});
