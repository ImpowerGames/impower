import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./notifications.html";

export default spec({
  tag: "se-notifications",
  context: WorkspaceContext.instance,
  css,
  html,
});
