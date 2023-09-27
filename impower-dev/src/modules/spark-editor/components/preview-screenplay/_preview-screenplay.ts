import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./preview-screenplay.html";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  context: ({ workspace }) =>
    ({
      textPulledAt: workspace?.current?.project?.textPulledAt || "",
    } as const),
  html,
  css,
});
