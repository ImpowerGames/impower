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
  context: ({ workspace }) => ({
    pulledAt: workspace?.current?.project?.pulledAt || "",
  }),
  html,
  selectors: {
    sparkdownScriptEditor: "",
  } as const,
  css,
});
