import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./footer-navigation.html";

export default spec({
  tag: "se-footer-navigation",
  stores: { workspace },
  html,
  css,
});
