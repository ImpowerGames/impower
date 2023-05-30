import { PdfDocument } from "../types/PdfDocument";
import { TextOptions } from "../types/TextOptions";

export const pdfFormatText = (
  doc: PdfDocument,
  text: string,
  x: number,
  y: number,
  options?: TextOptions
): void => {
  const cacheCurrentState = doc.formatState;
  doc.formatState = {};
  doc.processText?.(text, x, y, options);
  doc.formatState = cacheCurrentState;
};
