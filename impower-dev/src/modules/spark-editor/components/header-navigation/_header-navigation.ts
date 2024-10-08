import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./header-navigation.html";
import css from "./header-navigation.css";

export default spec({
  tag: "se-header-navigation",
  stores: { workspace },
  html,
  selectors: {
    doneButton: "",
    previewButton: "",
  } as const,
  css: [...sharedCSS, css],
});
