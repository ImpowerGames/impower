import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./preview-screenplay-toolbar.html";

export default spec({
  tag: "se-preview-screenplay-toolbar",
  stores: { workspace },
  html,
  css,
  selectors: {
    downloadButton: "",
  },
});
