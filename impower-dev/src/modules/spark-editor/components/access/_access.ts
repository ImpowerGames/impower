import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./access.html";

export default spec({
  tag: "se-access",
  cache: WorkspaceCache,
  css,
  html,
});
