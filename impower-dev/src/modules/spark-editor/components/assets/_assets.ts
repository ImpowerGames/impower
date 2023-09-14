import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./assets.html";

export default spec({
  tag: "se-assets",
  context: WorkspaceContext.instance,
  css,
  html,
});
