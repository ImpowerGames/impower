import { spec } from "../../../../../packages/spec-component/src/spec";
import css from "../styles/shared";
import workspace from "../workspace/WorkspaceStore";
import html from "./spark-editor.html";

export default spec({
  tag: "spark-editor",
  stores: { workspace },
  html,
  selectors: {
    interactionBlocker: "",
  } as const,
  css,
});
