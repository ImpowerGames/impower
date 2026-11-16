import type { Tree } from "@lezer/common";
import { screenplayTokens } from "../classes/ScreenplayParser";
import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PrintedRowSide } from "../types/LineOptions";
import type { PrintProfile } from "../types/PrintProfile";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";
import type { ScreenplayTokenType } from "../types/ScreenplayTokenType";
import { isHiddenIdentifier } from "./isHiddenIdentifier";
import { splitEmojiRuns } from "./emojiRuns";
import { cellWidth, emojiWidth, hangingGroup, lineMaxWidth, printProfileOf } from "./printGeometry";
import { insertAnchor, UNPLACED } from "./printedPosition";
import { getCharChunks, wrapParagraph } from "./wrapRows";

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

export interface PrintedRowStart {
  at: number;
  inserted: boolean;
  trailing?: number;
}

export interface PrintedName {
  at: number;
  tag: ScreenplayTokenType;
  level: number;
  pieces: { text: string; style: FormattedText }[];
}

export interface PageRow {
  at: number;
  side: PrintedRowSide;
  pieces: { text: string; style: FormattedText }[];
  name?: PrintedName;
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
  wrapStarts: PrintedRowStart[];
  names: PrintedName[];
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

const SINGLE_CELL_TEXT = /^[ -~]*$/;

const cellsOf = (text: string) => (SINGLE_CELL_TEXT.test(text) ? text.length : getCharChunks(text).length);

export const printedRowOffsets = (line: PageLine, profile: PrintProfile): number[] => {
  const cell = cellWidth(profile);
  const emoji = emojiWidth(profile);
  const measure = (piece: { text: string; isEmoji: boolean }) => cellsOf(piece.text) * (piece.isEmoji ? emoji : cell);
  const width = lineMaxWidth(profile, line);
  const offsets: number[] = [];
  let groupStart = 0;
  let group: FormattedText[] = [];
  const wrapGroup = () => {
    const { lead, rest, hang } = hangingGroup(group);
    const pieces = rest.flatMap((piece) => splitEmojiRuns(piece.text)).map((run) => ({ ...run, width: measure(run) }));
    const rows = wrapParagraph(pieces, width - hang * cell, measure);
    let offset = groupStart + (lead?.text.length ?? 0);
    for (const row of rows.slice(0, -1)) {
      offset += row.reduce((sum, part) => sum + part.text.length, 0);
      offsets.push(offset);
    }
    groupStart += group.reduce((sum, piece) => sum + piece.text.length, 0);
    group = [];
  };
  for (const piece of line.content) {
    if (group.length && (group[0]!.align ?? "") !== (piece.align ?? "")) wrapGroup();
    group.push(piece);
  }
  if (group.length) wrapGroup();
  return offsets;
};

const positionsOf = (content: FormattedText[]) =>
  content.flatMap((piece) => Array.from({ length: piece.text.length }, (_, index) => piece.at?.[index] ?? UNPLACED));

const breakRows = (content: FormattedText[], offsets: number[]): FormattedText[] => {
  if (offsets.length === 0) return content;
  const result: FormattedText[] = [];
  let start = 0;
  let next = 0;
  for (const piece of content) {
    let cut = 0;
    while (next < offsets.length && offsets[next]! < start + piece.text.length) {
      const at = offsets[next]! - start;
      if (at > cut) result.push({ ...piece, text: piece.text.slice(cut, at), at: piece.at?.slice(cut, at) });
      result.push({ ...piece, text: "\n", at: [UNPLACED] });
      cut = at;
      next++;
    }
    result.push(cut ? { ...piece, text: piece.text.slice(cut), at: piece.at?.slice(cut) } : piece);
    start += piece.text.length;
  }
  return result;
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
  scenesBefore = 0,
): ScreenplayPageLayout => {
  const profile = printProfileOf(config);
  const spans = new ScreenplayTypesetter().compose(
    screenplayTokens(tree, script, true),
    config,
    profile,
    scenesBefore,
  );
  const blankLines: number[] = [];
  const printed: number[] = [];
  const actionStarts: number[] = [];
  const printedLines: { at: number; lines: FormattedText[][] }[] = [];
  const places: PrintedPlaces = { runs: [], inserts: [], rows: [], unplaced: [] };
  const scenes: PrintedScene[] = [];
  const wrapStarts: PrintedRowStart[] = [];
  const names: PrintedName[] = [];
  let lastSource: number[] | undefined;
  let printedEnd = -1;
  const addPrinted = (lines: PageLine[] | undefined, wrap = true) => {
    for (const line of lines ?? []) {
      const offsets = wrap && line.source ? printedRowOffsets(line, profile) : [];
      const positions = offsets.length ? positionsOf(line.content) : [];
      const text = offsets.length ? line.content.map((piece) => piece.text).join("") : "";
      for (const offset of offsets) {
        const at = positions[offset] ?? UNPLACED;
        const before = positions[offset - 1] ?? UNPLACED;
        const trailing = before >= 0 && /\s/.test(text[offset - 1] ?? "") ? { trailing: before } : {};
        const anchor = insertAnchor(at);
        if (anchor !== undefined) wrapStarts.push({ at: anchor, inserted: true, ...trailing });
        else if (at >= 0) wrapStarts.push({ at, inserted: false, ...trailing });
      }
      const content = breakRows(line.content, offsets);
      if (line.source || line.row) {
        const runs = places.runs.length;
        const inserts = places.inserts.length;
        const rows = places.rows.length;
        placePrintedLine(line, script, places);
        let placed = -1;
        for (let index = runs; index < places.runs.length; index++) placed = Math.max(placed, places.runs[index]!.to);
        for (let index = inserts; index < places.inserts.length; index++) placed = Math.max(placed, places.inserts[index]!.at);
        for (let index = rows; index < places.rows.length; index++) placed = Math.max(placed, places.rows[index]!.at);
        if (placed >= 0) printedEnd = placed;
      }
      const sceneAt = line.scene !== undefined ? firstPlaced(line) : undefined;
      if (sceneAt !== undefined) scenes.push({ at: sceneAt, scene: line.scene!, bold: !!line.sceneBold });
      if (line.source && line.source === lastSource) {
        printedLines.at(-1)?.lines.push(content);
      }
      if (line.source && line.source !== lastSource) {
        printed.push(...line.source);
        lastSource = line.source;
        if (line.source[0] !== undefined) printedLines.push({ at: line.source[0], lines: [content] });
        if (line.tag === "action" && line.source[0] !== undefined) actionStarts.push(line.source[0]);
      }
    }
  };
  const followsPrintedOnLine = (from: number) => printedEnd > script.lastIndexOf("\n", from - 1) && printedEnd <= from;
  for (const span of spans) {
    if (span.tag === "meta") {
      for (const lines of Object.values(span.positions)) addPrinted(lines, false);
    } else if (span.tag === "separator") {
      if (span.from === undefined) continue;
      if (followsPrintedOnLine(span.from)) {
        places.rows.push({ at: printedEnd, side: "below", pieces: [] });
      } else {
        blankLines.push(span.from);
      }
    } else if ("lines" in span && span.from !== undefined && span.lines[0]?.level !== undefined) {
      if (isHiddenIdentifier(span.tag, config)) continue;
      for (const line of span.lines) {
        const name: PrintedName = {
          at: span.from,
          tag: line.tag,
          level: line.level ?? 0,
          pieces: breakRows(line.content, printedRowOffsets(line, profile)).map((piece) => ({ text: piece.text, style: piece })),
        };
        if (span.tag === "function" && followsPrintedOnLine(span.from)) {
          places.rows.push({ at: printedEnd, side: "below", pieces: name.pieces, name });
        } else {
          names.push(name);
        }
      }
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
    wrapStarts: wrapStarts.sort((a, b) => a.at - b.at),
    names,
  };
};
