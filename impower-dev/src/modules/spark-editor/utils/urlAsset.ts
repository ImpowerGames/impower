/**
 * Rewrite a remote (`.url`) asset's target. A `.url` file's *contents* are the
 * remote URL; the worker re-derives the asset's `src`/`type` on the resulting
 * change (see opfs-workspace `updateFileCache`), so previews, rows, and the
 * inspector re-resolve to the new target once the reload lands.
 *
 * Shared by every URL-edit entry point (the mobile preview header, the desktop
 * inspector Details panel, the desktop fullscreen overlay) so they write the
 * file identically. The `Workspace` import is deferred to keep this module safe
 * to pull into SSR-loaded trees.
 */
export async function writeUrlAsset(
  projectId: string,
  path: string,
  newUrl: string,
): Promise<void> {
  const { Workspace } = await import("../workspace/Workspace");
  const uri = Workspace.fs.getFileUri(projectId, path);
  await Workspace.fs.writeTextDocument({
    textDocument: { uri, version: 0, text: newUrl },
  });
  await Workspace.window.recordAssetChange();
}
