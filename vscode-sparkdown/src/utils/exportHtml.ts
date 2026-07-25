import * as vscode from "vscode";
import { generateScreenplayHtmlData } from "@impower/sparkdown-screenplay/src/utils/generateScreenplayHtmlData";
import { createEmojiHtmlInliner } from "@impower/sparkdown-screenplay-pdf/src/emoji/emojiHtml";
import ScreenplayParser from "@impower/sparkdown-screenplay/src/classes/ScreenplayParser";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts } from "./getDefaultScreenplayFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportHtml = async (
  context: vscode.ExtensionContext,
): Promise<void> => {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "html");
  if (!fsPath) {
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("html");
  // TODO: include all scripts relative to main.sd
  const script = editor.document.getText();
  const parser = new ScreenplayParser();
  const tokens = parser.parseAll([script]);
  const config = getSparkdownPreviewConfig(uri);
  const fonts = await getFonts(context);
  const emoji = fonts.emoji
    ? createEmojiHtmlInliner(fonts.emoji)
    : undefined;
  const rawHtml: string = generateScreenplayHtmlData(
    tokens,
    config,
    fonts,
    emoji,
  );
  const output =
    process?.platform !== "win32" ? rawHtml.replace(/\r\n/g, "\n") : rawHtml;
  await writeFile(fsPath, output);
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("html");
};
