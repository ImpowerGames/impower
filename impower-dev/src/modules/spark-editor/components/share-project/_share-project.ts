import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./share-project.html";

export default spec({
  tag: "se-share-project",
  stores: { workspace },
  html,
  css,
});
