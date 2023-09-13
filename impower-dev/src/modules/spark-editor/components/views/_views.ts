import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./views.html";

export default spec({
  tag: "se-views",
  cache: WorkspaceCache,
  css,
  html,
});
