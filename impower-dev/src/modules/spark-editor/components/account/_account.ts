import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./account.html";

export default spec({
  tag: "se-account",
  context: WorkspaceContext.instance,
  css,
  html,
});
