import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./sounds.html";

export default spec({
  tag: "se-sounds",
  stores: { workspace },
  html,
  css,
});
