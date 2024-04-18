import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./file-dropzone.css";
import html from "./file-dropzone.html";

export default spec({
  tag: "se-file-dropzone",
  stores: { workspace },
  html,
  selectors: {
    dragover: "",
  } as const,
  css: [...sharedCSS, css],
});
