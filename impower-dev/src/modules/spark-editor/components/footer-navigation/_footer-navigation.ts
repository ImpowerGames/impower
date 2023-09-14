import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./footer-navigation.html";

export default spec({
  tag: "se-footer-navigation",
  context: WorkspaceContext.instance,
  css,
  html,
});
