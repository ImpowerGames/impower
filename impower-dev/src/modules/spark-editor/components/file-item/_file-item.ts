import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./file-item.html";

export default spec({
  tag: "se-file-item",
  stores: { workspace },
  props: { filename: "" },
  html,
  selectors: {
    button: "",
  } as const,
  css,
});
