import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";

export default spec({
  tag: "se-header-title-caption",
  context: WorkspaceContext.instance,
  css,
  state: (store?: WorkspaceStore) => ({
    name: store?.project?.name || "",
    syncState: store?.project?.syncState || "",
  }),
  html: ({ state }) => {
    const { name, syncState } = state;
    const syncStateInfo =
      syncState === "cached"
        ? "Saved in cache"
        : syncState === "loading"
        ? "Loading..."
        : syncState === "importing"
        ? "Importing..."
        : syncState === "exporting"
        ? "Exporting..."
        : syncState === "syncing"
        ? "Syncing..."
        : syncState === "unsaved"
        ? "Unsaved changes"
        : syncState === "saved_online"
        ? "Saved online"
        : syncState === "saved_offline"
        ? "Saved offline"
        : syncState === "load_error"
        ? "Error: Unable to load project"
        : syncState === "import_error"
        ? "Error: Unable to import project"
        : syncState === "export_error"
        ? "Error: Unable to export project"
        : syncState === "sync_error"
        ? "Error: Unable to sync project"
        : syncState === "sync_conflict"
        ? "Sync Conflict"
        : "";
    const captionColor =
      syncState === "unsaved"
        ? "primary"
        : syncState === "load_error" ||
          syncState === "import_error" ||
          syncState === "export_error" ||
          syncState === "sync_error"
        ? "red"
        : syncState === "sync_conflict"
        ? "yellow"
        : "fg-60";
    const stateSkeleton = () => html`
      <s-skeleton id="name-skeleton">Saved in cache</s-skeleton>
    `;
    return html`
      <s-box
        child-layout="row"
        child-align="center"
        text-size="sm"
        text-weight="500"
        m-b="2px"
        text-color="${captionColor}"
      >
        ${name && syncStateInfo ? syncStateInfo : stateSkeleton}
      </s-box>
    `;
  },
});
