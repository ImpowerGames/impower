import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./header-navigation.html";

export default spec({
  tag: "se-header-navigation",
  cache: WorkspaceCache,
  css,
  html,
});
