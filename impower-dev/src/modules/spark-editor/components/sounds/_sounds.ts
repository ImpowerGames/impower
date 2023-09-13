import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./sounds.html";

export default spec({
  tag: "se-sounds",
  cache: WorkspaceCache,
  css,
  html,
});
