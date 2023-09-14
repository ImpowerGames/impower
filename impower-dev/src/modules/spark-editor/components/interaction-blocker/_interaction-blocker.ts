import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./interaction-blocker.html";

export default spec({
  tag: "se-interaction-blocker",
  context: WorkspaceContext.instance,
  css,
  html,
});
