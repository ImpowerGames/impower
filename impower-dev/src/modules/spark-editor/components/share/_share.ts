import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./share.html";

export default spec({
  tag: "se-share",
  cache: WorkspaceCache,
  css,
  html,
});
