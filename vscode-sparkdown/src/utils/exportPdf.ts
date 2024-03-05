import {
  generateSparkPdfData,
  pdfGenerate,
  PdfWriteStream,
} from "@impower/spark-screenplay/src/index";
import { encode } from "html-entities";
import * as vscode from "vscode";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { createPdfDocument } from "../pdf/createPdfDocument";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts } from "./getFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportPdf = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "pdf");
  if (!fsPath) {
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("pdf");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const config = getSparkdownPreviewConfig(uri);
  const fonts = await getFonts(context);
  const pdfData = generateSparkPdfData(
    result.frontMatter || {},
    result.tokens,
    config,
    fonts
  );
  const doc = createPdfDocument(pdfData);
  pdfGenerate(doc, pdfData, encode);
  const pdfBuffer = await new Promise<Uint8Array>((resolve) => {
    doc.pipe(
      new PdfWriteStream(async (chunks) => {
        resolve(Buffer.concat(chunks));
      })
    );
    doc.end();
  });
  await writeFile(fsPath, pdfBuffer);
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("pdf");
};
