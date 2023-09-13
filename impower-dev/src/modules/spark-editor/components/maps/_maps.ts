import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./maps.html";

export default spec({
  tag: "se-maps",
  cache: WorkspaceCache,
  css,
  html,
});
