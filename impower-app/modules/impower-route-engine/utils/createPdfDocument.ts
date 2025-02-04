import PDFKit from "pdfkit";
import addTextbox from "textbox-for-pdfkit";
import {
  FONT_KEY,
  getAuthor,
  getTitle,
  PdfData,
  PdfDocument,
  pdfFormatText,
  TextOptions
} from "../../../../sparkdown-screenplay";

export const createPdfDocument = (data: PdfData): PdfDocument => {
  const size = data?.print.paper_size === "a4" ? "A4" : "LETTER";
  const fontSize = data?.print.font_size || 12;
  const fonts = data?.fonts;

  const doc: PdfDocument & PDFKit.PDFDocument = new PDFKit({
    size,
    font: "",
    compress: false,
    margins: {
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    },
  });

  doc.fontKeys = FONT_KEY;
  doc.print = data.print;
  if (doc.info) {
    doc.info.Title = getTitle(data?.titleTokens);
    doc.info.Author = getAuthor(data?.titleTokens);
    doc.info.Creator = "sparkdown";
  }

  doc.registerFont(FONT_KEY.normal, fonts.normal);
  doc.registerFont(FONT_KEY.italic, fonts.italic);
  doc.registerFont(FONT_KEY.bold, fonts.bold);
  doc.registerFont(FONT_KEY.bolditalic, fonts.bolditalic);

  doc.font(doc?.fontKeys?.normal || "normal");
  doc.fontSize(fontSize);

  doc.textbox = (
    textObjects: {
      text: string;
      link: string | undefined;
      font: string;
      underline: string | boolean | undefined;
      color: string;
    }[],
    x: number,
    y: number,
    w: number,
    options?: TextOptions
  ): void => {
    addTextbox(textObjects, doc, x, y, w, options);
  };
  doc.formatText = (
    text: string,
    x: number,
    y: number,
    options?: TextOptions
  ): void => {
    pdfFormatText(doc, text, x, y, options);
  };

  return doc;
};
