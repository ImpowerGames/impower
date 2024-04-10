import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./file-add-button.css";
import html from "./file-add-button.html";

export default spec({
  tag: "se-file-add-button",
  stores: { workspace },
  props: { filename: "" },
  html,
  selectors: {
    button: "",
  } as const,
  css: [...sharedCSS, css],
});
