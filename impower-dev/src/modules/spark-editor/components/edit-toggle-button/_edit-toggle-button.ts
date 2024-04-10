import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./edit-toggle-button.html";

export default spec({
  tag: "se-edit-toggle-button",
  stores: { workspace },
  html,
  css,
  selectors: {
    button: "s-button",
  } as const,
});
