import type PDFKit from "pdfkit";
import LineBreaker from "linebreak";

import {
  measureTextFragments,
  measureTextWidth,
  checkParagraphFitsInLine,
} from "./textMeasurement";

import { createLine } from "./dataRearranger";
import { FormattedText } from "../types/FormattedText";
import { FormattedLine } from "../types/FormattedLine";

export const lineWrapParagraph = (
  paragraph: FormattedText[],
  textWidth: number,
  doc: PDFKit.PDFDocument
) => {
  // this function turns paragraphs into printable, wrapped lines

  // First check, whether paragraph fits in one line --> If yes return paragraph as line
  if (checkParagraphFitsInLine(paragraph, textWidth)) {
    return [createLine(paragraph)];
  }
  // If it doesn't fit completely inside the line do the line wrapping stuff
  let spaceLeftInLine = textWidth;
  let line: FormattedText[] = [];
  let lines = [];
  paragraph.forEach((textpart) => {
    //First check whether the complete textpart fits in line
    if (textpart.width != null && textpart.width <= spaceLeftInLine) {
      //if yes: directly add it to the line
      line.push(textpart);
      spaceLeftInLine -= textpart.width;
    } else {
      //if it doesn't fit completely: add it word by word to the line
      const wrappedLines = wrapTextInLines(
        textpart,
        spaceLeftInLine,
        textWidth,
        doc
      );
      wrappedLines.forEach((wrappedLine, index, array) => {
        switch (index) {
          case 0:
            // First Array Item must be added to the current line
            // If there is an empty string (because line was already too full), don't add it
            if (wrappedLine.text !== "") line.push(wrappedLine);
            // If the line is currently empty and the wrapped Line does not fit (because its a long string without spaces), then it should be ignored.
            if (line.length > 0) {
              lines.push([...line]);
              line = [];
              spaceLeftInLine = textWidth;
            }
            break;
          case array.length - 1:
            // last Array Item must generate a new line (where more can be added)
            line.push(wrappedLine);
            spaceLeftInLine -= wrappedLine.width;
            break;
          default:
            // all other lines can just be added as line to the lines array
            // (because they are already full).
            lines.push([wrappedLine]);
            spaceLeftInLine = textWidth;
        }
      });
    }
  });
  // If the complete paragraph has been line wrapped: add the last line
  // to the lines array, even if it's not full, yet --> but only if it's not empty
  if (line.length !== 0) lines.push([...line]);

  // Generate from lines array normalized line objects.
  return lines.map((l) => {
    return createLine(l);
  });
};

export const getWordChunks = (str: string) => {
  // Divide the string into word chunks
  // where each chunk is a potential line break opportunity
  const breaker = new LineBreaker(str);
  let last = 0;
  let bk;
  const chunks: string[] = [];
  while ((bk = breaker.nextBreak())) {
    const chunk = str.slice(last, bk.position);
    chunks.push(chunk);
    last = bk.position;
  }
  return chunks;
};

export const getCharChunks = (str: string) => {
  // Divide the string into char chunks
  // Where each chunk is a grapheme character
  try {
    // Use Intl.Segmenter to properly segment graphemes of all languages
    const segmenter = new Intl.Segmenter();
    return Array.from(segmenter.segment(str)).map((s) => s.segment);
  } catch {
    // If Intl.Segmenter is not supported, fallback to spreading the characters
    return [...str];
  }
};

export const wrapTextInLines = (
  textPart: FormattedText,
  widthLeft: number,
  widthTextbox: number,
  doc: PDFKit.PDFDocument
) => {
  // This function splits up text into smallest fragments (words & spaces)
  // and adds then word by word to lines until line is full. Then the line
  // is added to a "lines-array". The first line can have less space (spaceLeft)
  // for all other lines it is expected, that the complete textbox width
  // is available (widthTextbox)

  const { text } = textPart;
  // This is some crazy positive lookbehind regex, it finds all spaces and "-"
  // This is neccessary that no characters are removed when splitting the text.
  const wordChunks = getWordChunks(text);
  const measuredTextChunks = measureTextFragments(
    wordChunks.map((text) => ({ ...textPart, text })),
    doc
  );
  const lines = [{ ...textPart, text: "", width: 0 }];
  let spaceLeft = widthLeft;
  measuredTextChunks.forEach((measuredTextChunk) => {
    // Here we fill fragment by Fragment in lines
    // fullWidth = measured width of text
    // minWidth = measured width of text without trailing spaces
    if (measuredTextChunk.minWidth <= spaceLeft) {
      // If it fits in line --> Add word to current line
      lines.at(-1)!.text += measuredTextChunk.text;
      lines.at(-1)!.width += measuredTextChunk.fullWidth;
      spaceLeft -= measuredTextChunk.fullWidth;
    } else {
      // If it doesn't fit, start a new line.
      spaceLeft = widthTextbox;
      lines.push({ ...textPart, text: "", width: 0 });
      if (measuredTextChunk.minWidth <= spaceLeft) {
        // Add word to line
        lines.at(-1)!.text += measuredTextChunk.text;
        lines.at(-1)!.width += measuredTextChunk.fullWidth;
        spaceLeft -= measuredTextChunk.fullWidth;
      } else {
        // If still doesn't fit, split into characters and force a break
        const charChunks = getCharChunks(measuredTextChunk.text);
        measureTextFragments(
          charChunks.map((text) => ({ ...textPart, text })),
          doc
        ).forEach((measuredCharChunk) => {
          if (measuredCharChunk.minWidth <= spaceLeft) {
            // If it fits in line --> Add char to current line
            lines.at(-1)!.text += measuredCharChunk.text;
            lines.at(-1)!.width += measuredCharChunk.fullWidth;
            spaceLeft -= measuredCharChunk.fullWidth;
          } else {
            // If it doesn't fit, start a new line.
            spaceLeft = widthTextbox;
            lines.push({ ...textPart, text: "", width: 0 });
            // Add chars to line
            lines.at(-1)!.text += measuredCharChunk.text;
            lines.at(-1)!.width += measuredCharChunk.fullWidth;
            spaceLeft -= measuredCharChunk.fullWidth;
          }
        });
      }
    }
  });
  return lines;
};

export const removeTrailingSpaces = (
  lines: FormattedLine[],
  doc: PDFKit.PDFDocument
) => {
  // Words in text chunks do always keep the space at the end. This is
  // for left aligned texts no problem but can look quite ugly for right
  // aligned texts. So there is the option to remove them (removing is default active)
  // The function basically just goes through every line and checks whether last
  // Character is a space. If yes it's removed
  return lines.map((line) => {
    const lastText = line.texts[line.texts.length - 1]; // last text item in line
    if (lastText) {
      if (!lastText.removeTrailingSpaces) {
        return line;
      }
      if (lastText.text.substring(lastText.text.length - 1) !== " ") {
        return line;
      }
      const newLastText = lastText.text.substring(0, lastText.text.length - 1);
      const newLastTextWidth = measureTextWidth(
        { ...lastText, text: newLastText },
        doc
      );
      lastText.text = newLastText;
      lastText.width = newLastTextWidth;
    }
    let newLineWidth = 0;
    line.texts.forEach((text) => {
      if (text.width != null) {
        newLineWidth += text.width;
      }
    });
    line.width = newLineWidth;
    return line;
  });
};
