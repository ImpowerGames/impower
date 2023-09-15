import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./option-button.html";

export default spec({
  tag: "se-option-button",
  stores: { workspace },
  html,
  css,
});
