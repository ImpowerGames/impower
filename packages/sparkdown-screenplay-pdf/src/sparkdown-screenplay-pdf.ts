import PDFKit from "pdfkit";
import ScreenplayParser from "@impower/sparkdown-screenplay/src/classes/ScreenplayParser";
import type { ScreenplayConfig } from "@impower/sparkdown-screenplay/src/types/ScreenplayConfig";
import { generateScreenplayPrintData } from "@impower/sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import PdfWriteStream from "./classes/PdfWriteStream";
import ScreenplayPrinter from "./classes/ScreenplayPrinter";

onmessage = async (e) => {
  const message = e.data;
  if (message) {
    const method = message.method;
    const params = message.params;
    const id = message.id;
    if (params) {
      const scripts = params.scripts;
      const config = params.config;
      const fonts = params.fonts;
      const workDoneToken = params.workDoneToken;
      if (scripts && fonts) {
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
        const arrayBuffer = await buildPDF(scripts, config, fonts, onProgress);
        postMessage({ jsonrpc: "2.0", method, id, result: arrayBuffer }, [
          arrayBuffer,
        ]);
      }
    }
  }
};

export const buildPDF = async (
  scripts: string[],
  config?: ScreenplayConfig,
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
  const parser = new ScreenplayParser();
  const tokens = parser.parseAll(scripts);
  const printData = generateScreenplayPrintData(tokens, config, fonts);

  progress("report", 2);

  const size = printData?.profile.paper_size === "a4" ? "A4" : "LETTER";
  const fontSize = printData?.profile.font_size || 12;

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
  }) as PDFKit.PDFDocument;
  if (doc.info) {
    doc.info.Title = printData.info.title;
    doc.info.Author = printData.info.author;
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

  progress("report", 5);

  // Generate PDF Document
  const progressBeforeGenerate = currentProgress;
  const printer = new ScreenplayPrinter(
    doc,
    printData,
    (percentage: number) => {
      progress(
        "report",
        progressBeforeGenerate +
          (100 - progressBeforeGenerate) * (percentage / 100)
      );
    }
  );
  printer.print();

  const array = await new Promise<Buffer>((resolve) => {
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
