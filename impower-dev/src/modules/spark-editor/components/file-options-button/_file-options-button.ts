import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./file-options-button.html";

export default spec({
  tag: "se-file-options-button",
  stores: { workspace },
  html,
  selectors: {
    deleteOption: "",
    renameOption: "",
  } as const,
  css,
});
