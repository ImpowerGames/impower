import { UploadPanel } from "@impower/impower-ui/components";
import { closeUploads, landedIn, uploadHeading, uploadNote } from "../../workspace/uploadSession";
import type { AssetListing } from "../../workspace/assetsListing";
import workspace from "../../workspace/WorkspaceStore";

export default function UploadsPanel({ listing }: { listing: AssetListing }) {
  const rows = workspace.uploads.value;
  const found = workspace.uploadsFound.value;
  if (!rows.length && found === null) {
    return null;
  }
  return (
    <UploadPanel
      heading={uploadHeading(rows, found)}
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
