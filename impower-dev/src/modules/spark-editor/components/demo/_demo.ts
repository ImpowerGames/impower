import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./demo.html";

export default spec({
  tag: "se-demo",
  cache: WorkspaceCache,
  css,
  html,
});
