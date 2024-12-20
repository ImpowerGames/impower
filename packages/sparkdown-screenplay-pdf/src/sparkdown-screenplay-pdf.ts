import PDFKit from "pdfkit";
import addTextbox from "textbox-for-pdfkit";
import { PdfWriteStream } from "../../sparkdown-screenplay/src/classes/PdfWriteStream";
import type { FormattedText } from "../../sparkdown-screenplay/src/types/FormattedText";
import type { PdfDocument } from "../../sparkdown-screenplay/src/types/PdfDocument";
import type { SparkScreenplayConfig } from "../../sparkdown-screenplay/src/types/SparkScreenplayConfig";
import type { TextOptions } from "../../sparkdown-screenplay/src/types/TextOptions";
import { generateSparkPdfData } from "../../sparkdown-screenplay/src/utils/generateSparkPdfData";
import { pdfGenerate } from "../../sparkdown-screenplay/src/utils/pdfGenerate";
import { pdfPrintText } from "../../sparkdown-screenplay/src/utils/pdfPrintText";
import type { SparkProgram } from "../../sparkdown/src/types/SparkProgram";

onmessage = async (e) => {
  const message = e.data;
  if (message) {
    const method = message.method;
    const params = message.params;
    const id = message.id;
    if (params) {
      const programs = params.programs;
      const config = params.config;
      const fonts = params.fonts;
      const workDoneToken = params.workDoneToken;
      if (programs && fonts) {
        const onProgress = (value: {
          kind: string;
          title: string;
          cancellable: boolean;
          message?: string;
          percentage?: number;
        }) => {
          postMessage({
            jsonrpc: "2.0",
            method: `${method}/progress`,
            params: {
              token: workDoneToken,
              value,
            },
          });
        };
        const arrayBuffer = await buildPDF(programs, config, fonts, onProgress);
        postMessage({ jsonrpc: "2.0", method, id, result: arrayBuffer }, [
          arrayBuffer,
        ]);
      }
    }
  }
};

export const buildPDF = async (
  programs: SparkProgram[],
  config?: SparkScreenplayConfig,
  fonts?: {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
  },
  onProgress?: (value: {
    kind: string;
    title: string;
    cancellable: boolean;
    message?: string;
    percentage?: number;
  }) => void
) => {
  let currentProgress = 0;

  const progress = (kind: "begin" | "report" | "end", percentage: number) => {
    onProgress?.({
      kind,
      title: "Exporting PDF",
      cancellable: false,
      percentage,
    });
    currentProgress = percentage;
  };

  progress("begin", 0);

  // Layout PDF data
  const frontMatter = {}; // TODO: combineFrontMatter(programs);
  const tokens: any[] = []; // TODO: combineTokens(programs);
  const pdfData = generateSparkPdfData(frontMatter, tokens, config, fonts);

  progress("report", 2);

  const size = pdfData?.print.paper_size === "a4" ? "A4" : "LETTER";
  const fontSize = pdfData?.print.font_size || 12;

  // Prepare PDF document
  const doc = new PDFKit({
    size,
    font: "",
    compress: false,
    margins: {
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    },
  }) as PdfDocument & {
    info: { Title: string; Author: string; Creator: string };
  };
  doc.print = pdfData.print;
  if (doc.info) {
    doc.info.Title = pdfData.info.title;
    doc.info.Author = pdfData.info.author;
    doc.info.Creator = "sparkdown";
  }
  if (fonts) {
    doc.registerFont("normal", fonts.normal);
    doc.registerFont("italic", fonts.italic);
    doc.registerFont("bold", fonts.bold);
    doc.registerFont("bolditalic", fonts.bolditalic);
    doc.registerFont("Times-Roman", fonts.normal);
    if (fonts.normal) {
      doc.font(fonts.normal);
    }
  }
  doc.fontSize(fontSize);
  doc.textBox = (
    content: FormattedText[],
    x: number,
    y: number,
    w: number,
    options?: TextOptions
  ): void => {
    addTextbox(content, doc, x, y, w, options);
  };
  doc.printText = (
    content: FormattedText[],
    x: number,
    y: number,
    options?: TextOptions | undefined
  ): void => {
    pdfPrintText(doc, content, x, y, options);
  };

  progress("report", 5);

  // Generate PDF Document
  const progressBeforeGenerate = currentProgress;
  pdfGenerate(doc, pdfData, (percentage: number) => {
    progress(
      "report",
      progressBeforeGenerate +
        (100 - progressBeforeGenerate) * (percentage / 100)
    );
  });
  const array = await new Promise<Uint8Array>((resolve) => {
    doc.pipe(
      new PdfWriteStream(async (chunks) => {
        resolve(Buffer.concat(chunks));
      })
    );
    doc.end();
  });

  const arrayBuffer = array.buffer.slice(
    array.byteOffset,
    array.byteLength + array.byteOffset
  );

  progress("end", 100);

  return arrayBuffer;
};
