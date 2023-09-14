import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./maps.html";

export default spec({
  tag: "se-maps",
  context: WorkspaceContext.instance,
  css,
  html,
});
