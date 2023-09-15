import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-header-title-caption",
  stores: { workspace },
  context: ({ workspace }) =>
    ({
      name: workspace?.current?.project?.name || "",
      syncState: workspace?.current?.project?.syncState || "",
    } as const),
  html: ({ context }) => {
    const { name, syncState } = context;
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
        : syncState === "unsynced"
        ? "Unsynced changes"
        : syncState === "synced"
        ? "Synced online"
        : syncState === "offline"
        ? "Cannot sync while offline"
        : syncState === "load_error"
        ? "Error: Could not load project"
        : syncState === "import_error"
        ? "Error: Could not import project"
        : syncState === "export_error"
        ? "Error: Could not export project"
        : syncState === "sync_error"
        ? "Error: Could not sync project"
        : syncState === "sync_conflict"
        ? "Sync conflict detected"
        : "";
    const captionColor =
      syncState === "unsynced"
        ? "primary"
        : syncState === "load_error" ||
          syncState === "import_error" ||
          syncState === "export_error" ||
          syncState === "sync_error"
        ? "red"
        : syncState === "sync_conflict" || syncState === "offline"
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
  css,
});
