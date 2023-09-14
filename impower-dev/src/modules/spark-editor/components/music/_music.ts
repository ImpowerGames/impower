import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./music.html";

export default spec({
  tag: "se-music",
  context: WorkspaceContext.instance,
  css,
  html,
});
