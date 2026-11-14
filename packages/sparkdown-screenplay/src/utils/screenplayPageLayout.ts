import type { Tree } from "@lezer/common";
import { screenplayTokens } from "../classes/ScreenplayParser";
import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PrintedInsert } from "../types/PrintedInsert";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";

export interface PrintedRun {
  from: number;
  to: number;
  style: FormattedText;
  text?: string;
}

export interface PageInsert extends PrintedInsert {
  style?: FormattedText;
}

export interface PrintedScene {
  at: number;
  scene: string | number;
  bold: boolean;
}

export interface ScreenplayPageLayout {
  blankLines: number[];
  printed: number[];
  actionStarts: number[];
  inserts: PageInsert[];
  printedLines: { at: number; lines: FormattedText[][] }[];
  runs: PrintedRun[];
  scenes: PrintedScene[];
}

const addRuns = (line: PageLine, runs: PrintedRun[], script: string) => {
  for (const piece of line.content) {
    const at = piece.at ?? [];
    let start = -1;
    let previous = -1;
    const close = () => {
      if (start >= 0) runs.push({ from: start, to: previous + 1, style: piece });
      start = -1;
    };
    for (let index = 0; index < at.length; ) {
      const position = at[index]!;
      let end = index + 1;
      while (end < at.length && at[end] === position) end++;
      const printed = piece.text.slice(index, end);
      if (position < 0) {
        close();
      } else if (printed !== script[position]) {
        close();
        runs.push({ from: position, to: position + 1, style: piece, text: printed });
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
  const inserts: PageInsert[] = [];
  const printedLines: { at: number; lines: FormattedText[][] }[] = [];
  const runs: PrintedRun[] = [];
  const scenes: PrintedScene[] = [];
  const insertedPieces = new Map<number[], { text: string; style: FormattedText }[]>();
  const insertOwners: { source: number[]; inserts: PrintedInsert[] }[] = [];
  let lastSource: number[] | undefined;
  const collectInserted = (line: PageLine) => {
    if (!line.source) return;
    const collected = insertedPieces.get(line.source) ?? [];
    insertedPieces.set(line.source, collected);
    for (const piece of line.content) {
      const at = piece.at ?? [];
      for (let index = 0; index < at.length; index++) {
        if (at[index]! >= 0) continue;
        let end = index;
        while (end < at.length && at[end]! < 0) end++;
        collected.push({ text: piece.text.slice(index, end), style: piece });
        index = end;
      }
    }
  };
  const styledInserts = (source: number[], owned: PrintedInsert[]): PageInsert[] => {
    const pieces = insertedPieces.get(source) ?? [];
    let next = 0;
    return owned.map((insert) => {
      if (insert.text === "\n") return insert;
      let text = "";
      const first = pieces[next];
      while (next < pieces.length && text.length < insert.text.length) text += pieces[next++]!.text;
      return first && text === insert.text ? { ...insert, style: first.style } : insert;
    });
  };
  const addPrinted = (lines: PageLine[] | undefined) => {
    for (const line of lines ?? []) {
      addRuns(line, runs, script);
      collectInserted(line);
      const sceneAt = line.scene !== undefined ? firstPlaced(line) : undefined;
      if (sceneAt !== undefined) scenes.push({ at: sceneAt, scene: line.scene!, bold: !!line.sceneBold });
      if (line.source && line.source === lastSource) {
        printedLines.at(-1)?.lines.push(line.content);
      }
      if (line.source && line.source !== lastSource) {
        printed.push(...line.source);
        lastSource = line.source;
        if (line.source[0] !== undefined) printedLines.push({ at: line.source[0], lines: [line.content] });
        if (line.inserts) insertOwners.push({ source: line.source, inserts: line.inserts });
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
  for (const owner of insertOwners) inserts.push(...styledInserts(owner.source, owner.inserts));
  return { blankLines, printed: mergeRanges(printed), actionStarts, inserts: inserts.sort((a, b) => a.at - b.at),
    printedLines: printedLines.sort((a, b) => a.at - b.at),
    runs: runs.sort((a, b) => a.from - b.from),
    scenes,
  };
};
