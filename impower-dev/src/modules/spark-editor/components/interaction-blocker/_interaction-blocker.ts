import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./interaction-blocker.html";

export default spec({
  tag: "se-interaction-blocker",
  cache: WorkspaceCache,
  css,
  html,
});
