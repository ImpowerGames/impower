import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./logic-scripts-list.html";

export default spec({
  tag: "se-logic-scripts-list",
  stores: { workspace },
  html,
  css,
});
