import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./option-button.html";

export default spec({
  tag: "se-option-button",
  cache: WorkspaceCache,
  css,
  html,
});
