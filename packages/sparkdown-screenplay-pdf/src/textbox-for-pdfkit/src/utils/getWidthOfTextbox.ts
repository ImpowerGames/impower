import { FormattedText } from "../types/FormattedText";
import { measureTextFragments, measureTextWidth } from "./textMeasurement";

export const getWidthOfTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[]
) => {
  const spaceWidth = measureTextWidth({ text: " " }, doc);
  return measureTextFragments(text, spaceWidth, doc)
    .map((f) => f.width)
    .reduce((a, b) => a + b);
};
