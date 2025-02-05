import PDFKit from "pdfkit";
import { DEFAULT_STYLE } from "../constants/DEFAULT_STYLE";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";
import { normalizeTexts, summarizeParagraphs } from "./dataRearranger";
import { lineWrapParagraph, removeTrailingSpaces } from "./lineWrapper";
import { measureTextsWidth } from "./textMeasurement";

export const wrapTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[],
  width: number,
  style: TextOptions = {}
) => {
  const textboxStyle = { ...DEFAULT_STYLE, ...style };
  const normalizedTexts = normalizeTexts(text, textboxStyle);
  const textsWithWidth = measureTextsWidth(normalizedTexts, doc);
  const paragraphedTexts = summarizeParagraphs(textsWithWidth);
  const lines = paragraphedTexts.flatMap((pTexts) =>
    lineWrapParagraph(pTexts, width, doc)
  );
  return removeTrailingSpaces(lines, doc);
};
