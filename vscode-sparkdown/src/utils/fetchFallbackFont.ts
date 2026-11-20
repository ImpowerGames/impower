import * as vscode from "vscode";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export const fetchFallbackFont = async (
  context: vscode.ExtensionContext,
  url: string,
): Promise<ArrayBuffer | undefined> => {
  const folder = vscode.Uri.joinPath(context.globalStorageUri, "fallback-fonts");
  const file = vscode.Uri.joinPath(folder, url.split("/").slice(-3).join("-"));
  try {
    return toArrayBuffer(await vscode.workspace.fs.readFile(file));
  } catch {}
  const response = await fetch(url);
  if (!response.ok) {
    return undefined;
  }
  const buffer = await response.arrayBuffer();
  try {
    await vscode.workspace.fs.createDirectory(folder);
    await vscode.workspace.fs.writeFile(file, new Uint8Array(buffer));
  } catch {}
  return buffer;
};
