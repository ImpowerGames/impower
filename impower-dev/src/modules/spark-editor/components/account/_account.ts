import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./account.html";

export default spec({
  tag: "se-account",
  cache: WorkspaceCache,
  css,
  html,
});
