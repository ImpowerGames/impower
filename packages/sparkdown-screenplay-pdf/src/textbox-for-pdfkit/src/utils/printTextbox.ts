import PDFKit from "pdfkit";
import { DEFAULT_STYLE } from "../constants/DEFAULT_STYLE";
import { FormattedLine } from "../types/FormattedLine";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";
import { wrapTextbox } from "./wrapTextbox";
import { getFontAscent } from "./fontHandler";

// This is the main package of textbox-for-pdfkit. It is the main function
// which prepares the data by calling all the subfunctions.
// Also it handles the drawing of the text on the pdf, after it was prepared.

// This is the only function which is needed in the end. It calls
// every needed function step by step. Details what all functions
// are doing can be found in the respective packages (where the functions
// are defined)

export const printTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[],
  posX: number,
  posY: number,
  width: number,
  style: TextOptions = {},
  height: number | null = null
) => {
  const textboxStyle = { ...DEFAULT_STYLE, ...style };
  const lines = wrapTextbox(doc, text, width, textboxStyle);
  printLines(lines, width, posX, posY, textboxStyle, doc, height);
};

// This function takes the prepared Data and draws everything on the right
// position of the PDF

const printLines = (
  lines: FormattedLine[],
  width: number,
  posX: number,
  posY: number,
  style: TextOptions,
  doc: PDFKit.PDFDocument,
  maxHeight: number | null
) => {
  const textboxStyle = { ...DEFAULT_STYLE, ...style };
  let currentHeight = 0;
  let yPosition = posY;
  if (textboxStyle.font != null && textboxStyle.fontSize != null) {
    yPosition += getFontAscent(textboxStyle.font, textboxStyle.fontSize);
  }
  const baseline = textboxStyle.baseline || "alphabetic";
  lines.forEach((line, index) => {
    if (line.lineHeight != null) {
      currentHeight += line.lineHeight;
    }
    // we'll not go over the provided height, if any
    if (maxHeight && currentHeight > maxHeight) {
      return;
    }
    if (index !== 0) {
      if (line.lineHeight != null) {
        yPosition += line.lineHeight;
      }
    }
    let xPosition = getLineStartXPosition(line, width, posX);
    line.texts.forEach((textPart) => {
      if (textPart.font != null) {
        doc.font(textPart.font);
      }
      if (textPart.fontSize != null) {
        doc.fontSize(textPart.fontSize);
      }
      if (textPart.color != null) {
        doc.fillColor(textPart.color as keyof PDFKit.Mixins.ColorValue);
      }
      if (textPart.text != null) {
        doc.text(textPart.text, xPosition, yPosition, {
          link: textPart.link,
          align: "left",
          baseline: baseline as keyof PDFKit.Mixins.TextOptions["baseline"],
          oblique: textPart.oblique,
          underline: textPart.underline,
          strike: textPart.strike,
        });
      }
      if (textPart.width != null) {
        xPosition += textPart.width;
      }
    });
  });
};

// This function handles the setting of the line start X-position
// depending on its "align" attribute
function getLineStartXPosition(
  line: FormattedLine,
  width: number,
  posX: number
) {
  const spaceLeft = width - (line.width ?? 0);
  if (spaceLeft < 0) return posX;

  switch (line.align) {
    case "left":
      return posX;
    case "center":
      return posX + spaceLeft / 2;
    case "right":
      return posX + spaceLeft;
    default:
      return posX;
  }
}
