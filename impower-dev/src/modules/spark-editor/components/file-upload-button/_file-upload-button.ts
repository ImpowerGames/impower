import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./file-upload-button.html";

export default spec({
  tag: "se-file-upload-button",
  stores: { workspace },
  html,
  selectors: {
    button: "",
  } as const,
  css,
});
