import PDFKit from "pdfkit";
import { DEFAULT_STYLE } from "../constants/DEFAULT_STYLE";
import { FormattedLine } from "../types/FormattedLine";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";
import { wrapTextbox } from "./wrapTextbox";
import { getFontAscent } from "./fontHandler";
import { drawEmojiChunk, getEmojiProvider } from "../../../emoji/emojiText";
import { noteUnprintable } from "../../../utils/unprintableCharacters";
import {
  baselineShift,
  faceRuns,
  fallbackOblique,
} from "../../../utils/fallbackFonts";

export const printTextbox = (
  doc: PDFKit.PDFDocument,
  text: FormattedText[],
  posX: number,
  posY: number,
  width: number,
  style: TextOptions = {},
  height: number | null = null,
) => {
  const textboxStyle = { ...DEFAULT_STYLE, ...style };
  const lines = wrapTextbox(doc, text, width, textboxStyle);
  printLines(lines, width, posX, posY, textboxStyle, doc, height);
};

const printLines = (
  lines: FormattedLine[],
  width: number,
  posX: number,
  posY: number,
  style: TextOptions,
  doc: PDFKit.PDFDocument,
  maxHeight: number | null,
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
      const emojiProvider = textPart.isEmoji ? getEmojiProvider(doc) : undefined;
      if (emojiProvider && textPart.text) {
        const fontSize =
          textPart.fontSize ??
          (doc as unknown as { _fontSize?: number })._fontSize ??
          12;
        drawEmojiChunk(
          doc,
          emojiProvider,
          textPart.text,
          xPosition,
          yPosition,
          fontSize,
          String(baseline),
        );
      } else if (textPart.text != null) {
        const fontSize =
          textPart.fontSize ??
          (doc as unknown as { _fontSize?: number })._fontSize ??
          12;
        let runX = xPosition;
        const runs = faceRuns(doc, textPart.text, textPart.font);
        for (const [runIndex, run] of runs.entries()) {
          const runBaseline =
            run.fallback && textPart.font != null
              ? baselineShift(doc, textPart.font, baseline, fontSize)
              : baseline;
          if (run.font != null) {
            doc.font(run.font);
          }
          noteUnprintable(doc, run.text);
          const options: PDFKit.Mixins.TextOptions = {
            link: textPart.link,
            align: "left",
            baseline: runBaseline as keyof PDFKit.Mixins.TextOptions["baseline"],
            oblique: run.fallback
              ? fallbackOblique(textPart.font, textPart.oblique)
              : textPart.oblique,
            underline: textPart.underline,
            strike: textPart.strike,
          };
          doc.text(run.text, runX, yPosition, options);
          if (runIndex < runs.length - 1) {
            runX += doc.widthOfString(run.text, options);
          }
        }
        if (runs.some((run) => run.fallback) && textPart.font != null) {
          doc.font(textPart.font);
        }
      }
      if (textPart.width != null) {
        xPosition += textPart.width;
      }
    });
  });
};

function getLineStartXPosition(
  line: FormattedLine,
  width: number,
  posX: number,
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
