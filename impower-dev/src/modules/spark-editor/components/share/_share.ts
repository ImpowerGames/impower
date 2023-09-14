import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./share.html";

export default spec({
  tag: "se-share",
  context: WorkspaceContext.instance,
  css,
  html,
});
