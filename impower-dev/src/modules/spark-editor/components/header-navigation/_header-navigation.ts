import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./header-navigation.html";

export default spec({
  tag: "se-header-navigation",
  stores: { workspace },
  html,
  selectors: {
    doneButton: "",
    previewButton: "",
    mobileToolbar: "",
  } as const,
  css,
});
