import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./header-navigation.html";

export default spec({
  tag: "se-header-navigation",
  context: WorkspaceContext.instance,
  css,
  html,
});
