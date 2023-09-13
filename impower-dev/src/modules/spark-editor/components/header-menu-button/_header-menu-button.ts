import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./header-menu-button.html";

export default spec({
  tag: "se-header-menu-button",
  cache: WorkspaceCache,
  css,
  html,
});
