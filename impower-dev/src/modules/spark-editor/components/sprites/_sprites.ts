import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./sprites.html";

export default spec({
  tag: "se-sprites",
  cache: WorkspaceCache,
  css,
  html,
});
