import type { Tree } from "@lezer/common";
import { screenplayTokens } from "../classes/ScreenplayParser";
import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PrintedRowSide } from "../types/LineOptions";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";
import { insertAnchor, UNPLACED } from "./printedPosition";

export interface PrintedRun {
  from: number;
  to: number;
  style: FormattedText;
  text?: string;
}

export interface PageInsert {
  at: number;
  text: string;
  style: FormattedText;
}

export interface PrintedScene {
  at: number;
  scene: string | number;
  bold: boolean;
}

export interface PageRow {
  at: number;
  side: PrintedRowSide;
  pieces: { text: string; style: FormattedText }[];
}

export interface PrintedPlaces {
  runs: PrintedRun[];
  inserts: PageInsert[];
  rows: PageRow[];
  unplaced: string[];
}

export interface ScreenplayPageLayout extends PrintedPlaces {
  blankLines: number[];
  printed: number[];
  actionStarts: number[];
  printedLines: { at: number; lines: FormattedText[][] }[];
  scenes: PrintedScene[];
}

const placePrintedRow = (line: PageLine, side: PrintedRowSide, places: PrintedPlaces) => {
  let at: number | undefined;
  const pieces: PageRow["pieces"] = [];
  for (const piece of line.content) {
    let text = "";
    for (let index = 0; index < piece.text.length; index++) {
      const anchor = insertAnchor(piece.at?.[index] ?? UNPLACED);
      if (anchor !== undefined && (at === undefined || anchor === at)) {
        at = anchor;
        text += piece.text[index];
      } else {
        places.unplaced.push(piece.text[index]!);
      }
    }
    if (text) pieces.push({ text, style: piece });
  }
  if (at !== undefined) places.rows.push({ at, side, pieces });
};

export const placePrintedLine = (line: PageLine, script: string, places: PrintedPlaces) => {
  if (line.row) {
    placePrintedRow(line, line.row, places);
    return;
  }
  for (const piece of line.content) {
    const positionOf = (index: number) => piece.at?.[index] ?? UNPLACED;
    let start = -1;
    let previous = -1;
    const close = () => {
      if (start >= 0) places.runs.push({ from: start, to: previous + 1, style: piece });
      start = -1;
    };
    for (let index = 0; index < piece.text.length; ) {
      const position = positionOf(index);
      let end = index + 1;
      while (end < piece.text.length && positionOf(end) === position) end++;
      const printed = piece.text.slice(index, end);
      const anchor = insertAnchor(position);
      if (anchor !== undefined) {
        close();
        places.inserts.push({ at: anchor, text: printed, style: piece });
      } else if (position < 0) {
        close();
        places.unplaced.push(printed);
      } else if (printed !== script[position]) {
        close();
        places.runs.push({ from: position, to: position + 1, style: piece, text: printed });
      } else if (start >= 0 && position === previous + 1) {
        previous = position;
      } else {
        close();
        start = position;
        previous = position;
      }
      index = end;
    }
    close();
  }
};

const firstPlaced = (line: PageLine) => {
  for (const piece of line.content) {
    const found = piece.at?.find((position) => position >= 0);
    if (found !== undefined) return found;
  }
  return undefined;
};

const mergeRanges = (ranges: number[]): number[] => {
  let sorted = true;
  for (let index = 2; index < ranges.length && sorted; index += 2) {
    sorted = ranges[index]! >= ranges[index - 2]!;
  }
  const pairs: number[] = sorted
    ? ranges
    : Array.from({ length: ranges.length / 2 }, (_, index) => index * 2)
        .sort((a, b) => ranges[a]! - ranges[b]!)
        .flatMap((index) => [ranges[index]!, ranges[index + 1]!]);
  const merged: number[] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const from = pairs[index]!;
    const to = pairs[index + 1]!;
    if (merged.length > 0 && from <= merged[merged.length - 1]!) {
      merged[merged.length - 1] = Math.max(merged[merged.length - 1]!, to);
    } else {
      merged.push(from, to);
    }
  }
  return merged;
};

export const screenplayPageLayout = (
  tree: Tree,
  script: string,
  config?: ScreenplayConfig,
): ScreenplayPageLayout => {
  const profile =
    PRINT_PROFILES[config?.screenplay_print_paper_size || ""] ||
    PRINT_PROFILES.usletter;
  const spans = new ScreenplayTypesetter().compose(
    screenplayTokens(tree, script, true),
    config,
    profile,
  );
  const blankLines: number[] = [];
  const printed: number[] = [];
  const actionStarts: number[] = [];
  const printedLines: { at: number; lines: FormattedText[][] }[] = [];
  const places: PrintedPlaces = { runs: [], inserts: [], rows: [], unplaced: [] };
  const scenes: PrintedScene[] = [];
  let lastSource: number[] | undefined;
  const addPrinted = (lines: PageLine[] | undefined) => {
    for (const line of lines ?? []) {
      if (line.source || line.row) placePrintedLine(line, script, places);
      const sceneAt = line.scene !== undefined ? firstPlaced(line) : undefined;
      if (sceneAt !== undefined) scenes.push({ at: sceneAt, scene: line.scene!, bold: !!line.sceneBold });
      if (line.source && line.source === lastSource) {
        printedLines.at(-1)?.lines.push(line.content);
      }
      if (line.source && line.source !== lastSource) {
        printed.push(...line.source);
        lastSource = line.source;
        if (line.source[0] !== undefined) printedLines.push({ at: line.source[0], lines: [line.content] });
        if (line.tag === "action" && line.source[0] !== undefined) actionStarts.push(line.source[0]);
      }
    }
  };
  for (const span of spans) {
    if (span.tag === "meta") {
      for (const lines of Object.values(span.positions)) addPrinted(lines);
    } else if (span.tag === "separator") {
      if (span.from !== undefined) blankLines.push(span.from);
    } else if (span.tag === "dual") {
      addPrinted(span.positions.l);
      addPrinted(span.positions.r);
    } else if ("lines" in span) {
      addPrinted(span.lines);
    }
  }
  return {
    blankLines,
    printed: mergeRanges(printed),
    actionStarts,
    printedLines: printedLines.sort((a, b) => a.at - b.at),
    runs: places.runs.sort((a, b) => a.from - b.from),
    inserts: places.inserts.sort((a, b) => a.at - b.at),
    rows: places.rows,
    unplaced: places.unplaced,
    scenes,
  };
};
