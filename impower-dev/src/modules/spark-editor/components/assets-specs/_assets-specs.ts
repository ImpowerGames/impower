import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./assets-specs.html";

export default spec({
  tag: "se-assets-specs",
  stores: { workspace },
  html,
  css,
});
