import type { Tree } from "@lezer/common";
import { screenplayTokens } from "../classes/ScreenplayParser";
import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PrintedInsert } from "../types/PrintedInsert";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";

export interface ScreenplayPageLayout {
  blankLines: number[];
  printed: number[];
  actionStarts: number[];
  inserts: PrintedInsert[];
  printedLines: { at: number; lines: FormattedText[][] }[];
}

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
    screenplayTokens(tree, script),
    config,
    profile,
  );
  const blankLines: number[] = [];
  const printed: number[] = [];
  const actionStarts: number[] = [];
  const inserts: PrintedInsert[] = [];
  const printedLines: { at: number; lines: FormattedText[][] }[] = [];
  let lastSource: number[] | undefined;
  const addPrinted = (lines: PageLine[] | undefined) => {
    for (const line of lines ?? []) {
      if (line.source && line.source === lastSource) {
        printedLines.at(-1)?.lines.push(line.content);
      }
      if (line.source && line.source !== lastSource) {
        printed.push(...line.source);
        lastSource = line.source;
        if (line.source[0] !== undefined) printedLines.push({ at: line.source[0], lines: [line.content] });
        if (line.inserts) inserts.push(...line.inserts);
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
  return { blankLines, printed: mergeRanges(printed), actionStarts, inserts: inserts.sort((a, b) => a.at - b.at),
    printedLines: printedLines.sort((a, b) => a.at - b.at),
  };
};
