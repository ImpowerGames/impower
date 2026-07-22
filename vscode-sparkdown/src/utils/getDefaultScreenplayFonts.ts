import * as vscode from "vscode";
import { readFile } from "./readFile";

export const getFonts = async (
  context: vscode.ExtensionContext,
): Promise<{
  normal: ArrayBuffer;
  bold: ArrayBuffer;
  italic: ArrayBuffer;
  bolditalic: ArrayBuffer;
  emoji: ArrayBuffer;
}> => {
  const [normal, bold, italic, bolditalic, emoji] = await Promise.all([
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime.ttf",
      ),
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold.ttf",
      ),
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-italic.ttf",
      ),
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold-italic.ttf",
      ),
    ),
    readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "noto-color-emoji.ttf",
      ),
    ),
  ]);

  if (!normal) {
    throw new Error("Missing 'normal' font");
  }
  if (!bold) {
    throw new Error("Missing 'bold' font");
  }
  if (!italic) {
    throw new Error("Missing 'italic' font");
  }
  if (!bolditalic) {
    throw new Error("Missing 'bolditalic' font");
  }
  if (!emoji) {
    throw new Error("Missing 'emoji' font");
  }
  return {
    normal,
    bold,
    italic,
    bolditalic,
    emoji
  };
};
