import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./demo.html";

export default spec({
  tag: "se-demo",
  context: WorkspaceContext.instance,
  css,
  html,
});
