import PDFKit from "pdfkit";
import addTextbox from "textbox-for-pdfkit";
import {
  FormattedText,
  PdfData,
  PdfDocument,
  TextOptions,
  pdfPrintText,
} from "../../../../../packages/sparkdown-screenplay/src";

export const createPdfDocument = (data: PdfData): PdfDocument => {
  const size = data?.print.paper_size === "a4" ? "A4" : "LETTER";
  const fontSize = data?.print.font_size || 12;
  const fonts = data?.fonts;

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

  doc.print = data.print;
  if (doc.info) {
    doc.info.Title = data.info.title;
    doc.info.Author = data.info.author;
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

  console.log(doc, fonts);

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

  return doc;
};
