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
