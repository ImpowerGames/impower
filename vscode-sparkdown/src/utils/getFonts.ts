import * as vscode from "vscode";
import { readFile } from "./readFile";

export const getFonts = async (
  context: vscode.ExtensionContext
): Promise<{
  normal: ArrayBuffer;
  bold: ArrayBuffer;
  italic: ArrayBuffer;
  bolditalic: ArrayBuffer;
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
  } as {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
  };
};
