import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-header-sync-toolbar",
  stores: { workspace },
  context: ({ workspace }) =>
    ({
      id: workspace?.current?.project?.id || "",
      syncState: workspace?.current?.project?.syncState || "",
    } as const),
  html: ({ context }) => {
    const { id, syncState } = context;
    const canSync = id && id !== WorkspaceConstants.LOCAL_PROJECT_ID;
    if (!canSync) {
      return "";
    }
    const syncButton = () => html`
      <s-button
        id="syncButton"
        icon="refresh white"
        variant="icon"
        width="56"
        height="56"
        text-size="20"
        color="fg"
      ></s-button>
    `;
    const conflictToolbar = () => html`
      <se-header-sync-conflict-toolbar
        id="conflictToolbar"
      ></se-header-sync-conflict-toolbar>
    `;
    return html`${syncState === "sync_conflict"
      ? conflictToolbar
      : syncButton}`;
  },
  selectors: {
    syncButton: null,
    conflictToolbar: null,
  } as const,
  css,
});
