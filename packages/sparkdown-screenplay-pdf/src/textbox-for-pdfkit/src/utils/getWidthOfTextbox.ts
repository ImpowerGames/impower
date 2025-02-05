import { FormattedText } from "../types/FormattedText";
import { measureTextFragments, measureTextWidth } from "./textMeasurement";

export const getWidthOfTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[]
) => {
  return measureTextFragments(text, doc)
    .map((f) => f.fullWidth)
    .reduce((a, b) => a + b);
};
