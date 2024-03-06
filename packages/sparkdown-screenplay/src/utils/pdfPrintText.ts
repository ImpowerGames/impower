import { FormattedText } from "../classes/Typesetter";
import { PdfDocument } from "../types/PdfDocument";
import { TextOptions } from "../types/TextOptions";

const SIZE_FACTOR = 72;
const DEFAULT_COLOR = "#000000";

export const pdfPrintText = (
  doc: PdfDocument,
  content: FormattedText[],
  x: number,
  y: number,
  options?: TextOptions
): void => {
  const pageWidth = doc.print?.page_width;
  const width = options?.width !== undefined ? options?.width : pageWidth || 0;
  const color = options?.color || DEFAULT_COLOR;
  const contentWithFonts = content.map((c) => ({
    ...c,
    font:
      c.font ??
      (c.bold && c.italic
        ? "bolditalic"
        : c.bold
        ? "bold"
        : c.italic
        ? "italic"
        : "normal"),
  }));

  doc.fill(color);

  if (options?.highlight) {
    doc.highlight(
      x * SIZE_FACTOR,
      y * SIZE_FACTOR + doc.currentLineHeight() / 2,
      doc.widthOfString(contentWithFonts.map((c) => c.text).join("")),
      doc.currentLineHeight(),
      { color: options?.highlightColor }
    );
  }

  doc.textBox?.(
    contentWithFonts,
    x * SIZE_FACTOR,
    y * SIZE_FACTOR,
    width * SIZE_FACTOR,
    {
      lineBreak: options?.lineBreak,
      align: options?.align,
      baseline: "top",
    }
  );
};
