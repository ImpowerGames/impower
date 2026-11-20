/// <reference path="../linebreak.d.ts" />
import LineBreaker from "linebreak";

export interface WrapPiece {
  text: string;
  width?: number;
}

export type MeasurePiece<T extends WrapPiece> = (piece: T) => number;

export const getWordChunks = (str: string) => {
  const breaker = new LineBreaker(str);
  let last = 0;
  let bk;
  const chunks: string[] = [];
  while ((bk = breaker.nextBreak())) {
    chunks.push(str.slice(last, bk.position));
    last = bk.position;
  }
  return chunks;
};

export const getCharChunks = (str: string) => {
  try {
    const segmenter = new Intl.Segmenter();
    return Array.from(segmenter.segment(str)).map((s) => s.segment);
  } catch {
    return [...str];
  }
};

const fits = (width: number, space: number, box: number) => width <= space + Math.abs(box) * 1e-9;

const measureFragments = <T extends WrapPiece>(piece: T, texts: string[], measure: MeasurePiece<T>) =>
  texts.map((text) => ({
    text,
    fullWidth: measure({ ...piece, text }),
    minWidth: measure({ ...piece, text: text.trimEnd() }),
  }));

export const wrapPieceInRows = <T extends WrapPiece>(
  piece: T,
  widthLeft: number,
  widthTextbox: number,
  measure: MeasurePiece<T>,
): T[] => {
  const rows: T[] = [{ ...piece, text: "", width: 0 }];
  let spaceLeft = widthLeft;
  const add = (fragment: { text: string; fullWidth: number }) => {
    rows.at(-1)!.text += fragment.text;
    rows.at(-1)!.width! += fragment.fullWidth;
    spaceLeft -= fragment.fullWidth;
  };
  const startRow = () => {
    spaceLeft = widthTextbox;
    rows.push({ ...piece, text: "", width: 0 });
  };
  for (const word of measureFragments(piece, getWordChunks(piece.text), measure)) {
    if (fits(word.minWidth, spaceLeft, widthTextbox)) {
      add(word);
      continue;
    }
    startRow();
    if (fits(word.minWidth, spaceLeft, widthTextbox)) {
      add(word);
      continue;
    }
    for (const character of measureFragments(piece, getCharChunks(word.text), measure)) {
      if (!fits(character.minWidth, spaceLeft, widthTextbox)) startRow();
      add(character);
    }
  }
  return rows;
};

export const wrapParagraph = <T extends WrapPiece>(
  paragraph: T[],
  textWidth: number,
  measure: MeasurePiece<T>,
): T[][] => {
  const total = paragraph.reduce((sum, piece) => sum + (piece.width ?? 0), 0);
  if (fits(total, textWidth, textWidth)) return [paragraph];
  let spaceLeftInLine = textWidth;
  let line: T[] = [];
  const lines: T[][] = [];
  for (const piece of paragraph) {
    if (piece.width != null && fits(piece.width, spaceLeftInLine, textWidth)) {
      line.push(piece);
      spaceLeftInLine -= piece.width;
      continue;
    }
    const wrapped = wrapPieceInRows(piece, spaceLeftInLine, textWidth, measure);
    wrapped.forEach((row, index, array) => {
      if (index === 0) {
        if (row.text !== "") line.push(row);
        if (line.length > 0) {
          lines.push([...line]);
          line = [];
          spaceLeftInLine = textWidth;
        }
      } else if (index === array.length - 1) {
        line.push(row);
        spaceLeftInLine -= row.width ?? 0;
      } else {
        lines.push([row]);
        spaceLeftInLine = textWidth;
      }
    });
  }
  if (line.length !== 0) lines.push([...line]);
  return lines;
};
