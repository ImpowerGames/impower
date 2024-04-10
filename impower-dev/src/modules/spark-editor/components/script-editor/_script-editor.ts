import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./script-editor.html";

export default spec({
  tag: "se-script-editor",
  stores: { workspace },
  props: {
    filename: "",
  },
  reducer: ({ workspace }) =>
    ({
      textPulledAt: workspace?.current?.project?.textPulledAt || "",
    } as const),
  html,
  selectors: {
    sparkdownScriptEditor: "",
  } as const,
  css,
});
