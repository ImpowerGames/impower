import { UploadPanel } from "@impower/impower-ui/components";
import { closeUploads, landedIn, uploadHeading, uploadNote } from "../../workspace/uploadSession";
import type { AssetListing } from "../../workspace/assetsListing";
import workspace from "../../workspace/WorkspaceStore";

export default function UploadsPanel({ listing }: { listing: AssetListing }) {
  const rows = workspace.uploads.value;
  if (!rows.length) {
    return null;
  }
  return (
    <UploadPanel
      heading={uploadHeading(rows)}
      onClose={closeUploads}
      rows={rows.map((row) => ({
        key: String(row.id),
        name: row.name,
        state: row.state,
        note: uploadNote(row, (path) => landedIn(listing, path)),
      }))}
    />
  );
}
