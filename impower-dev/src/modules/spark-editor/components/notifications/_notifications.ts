import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./notifications.html";

export default spec({
  tag: "se-notifications",
  cache: WorkspaceCache,
  css,
  html,
});
