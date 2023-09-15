import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./music.html";

export default spec({
  tag: "se-music",
  stores: { workspace },
  html,
  css,
});
