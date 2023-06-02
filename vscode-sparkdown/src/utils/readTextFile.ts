import * as vscode from "vscode";
import { readFile } from "./readFile";

export const readTextFile = async (
  filepath: string | vscode.Uri,
  encoding?: BufferEncoding | undefined
): Promise<string | undefined> => {
  const data = await readFile(filepath);
  if (data === undefined) {
    return undefined;
  }
  return Buffer.from(data).toString(encoding);
};
