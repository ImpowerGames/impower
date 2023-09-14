import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./preview-game.html";

export default spec({
  tag: "se-preview-game",
  context: WorkspaceContext.instance,
  css,
  html,
});
