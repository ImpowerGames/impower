import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./assets.html";

export default spec({
  tag: "se-assets",
  cache: WorkspaceCache,
  css,
  html,
});
