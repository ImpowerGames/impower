import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./interaction-blocker.html";

export default spec({
  tag: "se-interaction-blocker",
  stores: { workspace },
  html,
  css,
});
