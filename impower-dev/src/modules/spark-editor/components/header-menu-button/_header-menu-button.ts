import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./header-menu-button.html";

export default spec({
  tag: "se-header-menu-button",
  stores: { workspace },
  html,
  selectors: {
    openButton: "",
    closeButton: "",
    account: "",
    drawer: "",
  } as const,
  css,
});
