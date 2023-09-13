import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./details.html";

export default spec({
  tag: "se-details",
  cache: WorkspaceCache,
  css,
  html,
});
