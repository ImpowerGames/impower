import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./preview-game.html";

export default spec({
  tag: "se-preview-game",
  stores: { workspace },
  html,
  css,
});
