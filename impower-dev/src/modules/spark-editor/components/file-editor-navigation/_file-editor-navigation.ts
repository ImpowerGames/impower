import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./file-editor-navigation.css";
import html from "./file-editor-navigation.html";

export default spec({
  tag: "se-file-editor-navigation",
  stores: { workspace },
  html,
  css: [...sharedCSS, css],
});
