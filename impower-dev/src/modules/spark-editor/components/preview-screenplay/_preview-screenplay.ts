import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./preview-screenplay.html";

export default spec({
  tag: "se-preview-screenplay",
  stores: { workspace },
  context: ({ workspace }) =>
    ({
      pulledAt: workspace?.current?.project?.pulledAt || "",
    } as const),
  html,
  css,
});
