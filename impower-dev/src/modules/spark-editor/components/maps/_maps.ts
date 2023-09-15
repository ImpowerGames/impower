import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./maps.html";

export default spec({
  tag: "se-maps",
  stores: { workspace },
  html,
  css,
});
