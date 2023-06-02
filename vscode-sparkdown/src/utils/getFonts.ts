import * as vscode from "vscode";
import { readFile } from "./readFile";

export const getFonts = async (
  context: vscode.ExtensionContext
): Promise<{
  normal?: Uint8Array;
  bold?: Uint8Array;
  italic?: Uint8Array;
  bolditalic?: Uint8Array;
}> => {
  const [normal, bold, italic, bolditalic] = await Promise.all([
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime.ttf"
      )
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold.ttf"
      )
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-italic.ttf"
      )
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold-italic.ttf"
      )
    ),
  ]);

  return {
    normal,
    bold,
    italic,
    bolditalic,
  };
};
