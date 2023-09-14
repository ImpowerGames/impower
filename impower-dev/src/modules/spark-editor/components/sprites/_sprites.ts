import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./sprites.html";

export default spec({
  tag: "se-sprites",
  context: WorkspaceContext.instance,
  css,
  html,
});
