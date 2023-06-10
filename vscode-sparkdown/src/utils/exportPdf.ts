import {
  generateSparkPdfData,
  pdfGenerate,
  PdfWriteStream,
} from "@impower/spark-screenplay/src/index";
import { encode } from "html-entities";
import * as vscode from "vscode";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { createPdfDocument } from "../pdf/createPdfDocument";
import { commandViewProvider } from "../state/commandViewProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts } from "./getFonts";
import { getSparkdownConfig } from "./getSparkdownConfig";
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
  commandViewProvider.notifyExportStarted("pdf");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const config = getSparkdownConfig(uri);
  const fonts = await getFonts(context);
  const pdfData = generateSparkPdfData(result, config, fonts);
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
  commandViewProvider.notifyExportEnded("pdf");
};
