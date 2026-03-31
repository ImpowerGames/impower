import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./file-upload-button.css";
import html from "./file-upload-button.html";

export default spec({
  tag: "se-file-upload-button",
  stores: { workspace },
  html,
  selectors: {
    button: "",
  } as const,
  css,
  sharedCSS,
});
