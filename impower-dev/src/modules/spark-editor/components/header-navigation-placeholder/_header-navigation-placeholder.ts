import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./header-navigation-placeholder.css";
import html from "./header-navigation-placeholder.html";

export default spec({
  tag: "se-header-navigation-placeholder",
  stores: { workspace },
  html,
  selectors: {
    doneButton: "",
    previewButton: "",
  } as const,
  css,
  sharedCSS,
});
