import { WorkspaceState } from "@impower/spark-editor-protocol/src/types";
import { html } from "../../../../../../packages/spark-element/src/utils/html";

export default (state: { store?: WorkspaceState }) => {
  const projectName = state?.store?.project?.name ?? "";
  const syncState = state?.store?.project?.syncState || "";
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
      : syncState === "saved"
      ? "Saved online"
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
  return {
    html: html`
      <s-box
        child-layout="row"
        child-align="center"
        text-size="sm"
        text-weight="500"
        m-b="2px"
        text-color="${captionColor}"
      >
        ${projectName && syncStateInfo ? syncStateInfo : stateSkeleton}
      </s-box>
    `,
  };
};
