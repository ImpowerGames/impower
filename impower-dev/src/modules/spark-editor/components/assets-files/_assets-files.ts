import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./assets-files.html";

export default spec({
  tag: "se-assets-files",
  stores: { workspace },
  html,
  css,
});
