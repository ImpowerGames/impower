import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./header-sync-conflict-toolbar.html";

export default spec({
  tag: "se-header-sync-conflict-toolbar",
  stores: { workspace },
  html,
  selectors: {
    pullButton: "",
    pushButton: "",
    pullDialog: "",
    pushDialog: "",
  } as const,
  css,
});
