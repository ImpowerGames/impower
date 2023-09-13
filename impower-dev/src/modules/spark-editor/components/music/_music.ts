import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./music.html";

export default spec({
  tag: "se-music",
  cache: WorkspaceCache,
  css,
  html,
});
