import { DEFAULT_STYLE } from "../constants/DEFAULT_STYLE";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";
import { composeLines } from "./composeLines";

export const getHeightOfTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[],
  width: number,
  style: TextOptions = {},
  maxHeight: number | null = null
) => {
  const textboxStyle = { ...DEFAULT_STYLE, ...style };
  const lines = composeLines(doc, text, width, textboxStyle);
  let currentHeight = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.lineHeight != null) {
      currentHeight += line.lineHeight;
    }
    if (maxHeight && currentHeight > maxHeight) {
      return maxHeight;
    }
  }
  return currentHeight;
};
