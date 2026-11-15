import type { PageLine } from "../types/DocumentSpan";
import type { FormattedText } from "../types/FormattedText";
import type { PrintedRowSide } from "../types/LineOptions";
import type { ScreenplayToken } from "../types/ScreenplayToken";
import { isStyleCode } from "../../../sparkdown/src/runtime/displayStyle";
import { insertAnchor, insertedAt, UNPLACED } from "./printedPosition";

export const GLUED_ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

export const ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set([
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
]);

export const IF_BLOCK = "LuauSparkdownIfBlock";

export const IF_BRANCHES: ReadonlySet<string> = new Set(["LuauSparkdownElseifBlock", "LuauSparkdownElseBlock"]);

export const ALTERNATOR_SEPARATOR = "LuauAlternatorSeparator";

type AlternativeMark = "open" | "bar" | "close";

const alternativeMark = (mark: AlternativeMark): string => {
  switch (mark) {
    case "open":
      return "{";
    case "bar":
      return "|";
    case "close":
      return "}";
  }
};

export type GluedAlternatorJoin = "before" | "between" | "after";

export const gluedAlternatorJoin = (join: GluedAlternatorJoin): string => {
  switch (join) {
    case "before":
      return ` ${alternativeMark("open")}`;
    case "between":
      return alternativeMark("bar");
    case "after":
      return alternativeMark("close");
  }
};

const rowMark = (levels: readonly boolean[], firstRow: boolean): string =>
  levels
    .map((first) => (first && firstRow ? `${alternativeMark("bar")} ` : " ".repeat(alternativeMark("bar").length + 1)))
    .join("");

const PRINTED_TAGS: ReadonlySet<string> = new Set([
  "title",
  "heading",
  "transitional",
  "action",
  "dialogue_character",
  "dialogue_parenthetical",
  "dialogue_content",
  "choice",
]);

const placedAnchor = (position: number): number | undefined =>
  position >= 0 ? position : insertAnchor(position);

const anchorAfter = (at: readonly number[]): number | undefined => {
  for (let index = at.length - 1; index >= 0; index--) {
    const position = at[index]!;
    if (position >= 0) return position + 1;
    const anchor = insertAnchor(position);
    if (anchor !== undefined) return anchor;
  }
  return undefined;
};

const insertedRun = (length: number, anchor: number | undefined): number[] =>
  new Array<number>(length).fill(anchor === undefined ? UNPLACED : insertedAt(anchor));

const printedValue = (token: ScreenplayToken) => (token.prefix ?? "") + (token.styled ?? token.text ?? "");

const isPrinted = (character: string) => !isStyleCode(character) && /\S/.test(character);

const printsText = (token: ScreenplayToken) => [...printedValue(token)].some(isPrinted);

const firstPrintedAnchor = (token: ScreenplayToken): number | undefined => {
  if (!token.at) return undefined;
  const value = printedValue(token);
  for (let index = 0; index < value.length; index++) {
    const anchor = isPrinted(value[index]!) ? placedAnchor(token.at[index] ?? UNPLACED) : undefined;
    if (anchor !== undefined) return anchor;
  }
  return undefined;
};

const markRow = (
  line: "open" | "close",
  anchor: number | undefined,
  row: PrintedRowSide,
  positions: boolean,
): ScreenplayToken => {
  const text = alternativeMark(line);
  return {
    tag: "action",
    text,
    styled: text,
    source: [],
    row,
    ...(positions ? { at: insertedRun(text.length, anchor) } : {}),
  };
};

export const markAlternatives = (tokens: ScreenplayToken[], arms: readonly number[], positions: boolean) => {
  const bodies: number[][] = [];
  arms.forEach((start, index) => {
    const end = arms[index + 1] ?? tokens.length;
    const body: number[] = [];
    for (let token = start; token < end; token++) {
      if (PRINTED_TAGS.has(tokens[token]!.tag) && printsText(tokens[token]!)) body.push(token);
    }
    if (body.length > 0) bodies.push(body);
  });
  if (bodies.length === 0) return;
  for (const body of bodies) {
    body.forEach((index, position) => {
      const token = tokens[index]!;
      token.alternative = [position === 0, ...(token.alternative ?? [])];
    });
  }
  const firstIndex = bodies[0]![0]!;
  const lastIndex = bodies.at(-1)!.at(-1)!;
  const openAnchor = firstPrintedAnchor(tokens[firstIndex]!);
  const closeAnchor = tokens[lastIndex]!.at && anchorAfter(tokens[lastIndex]!.at!);
  tokens.splice(lastIndex + 1, 0, markRow("close", closeAnchor, "below", positions));
  tokens.splice(firstIndex, 0, markRow("open", openAnchor, "above", positions));
};

export const HANG_LIMIT = 16;

const groupAnchor = (pieces: readonly FormattedText[]): number | undefined => {
  for (const piece of pieces) {
    for (let index = 0; index < piece.text.length; index++) {
      const anchor = isPrinted(piece.text[index]!) ? placedAnchor(piece.at?.[index] ?? UNPLACED) : undefined;
      if (anchor !== undefined) return anchor;
    }
  }
  return undefined;
};

export const markAlternativeRows = (
  lines: PageLine[],
  levels: readonly boolean[],
  markStyle: FormattedText,
) => {
  let row = 0;
  for (const line of lines) {
    const positions = line.content.some((piece) => piece.at);
    const hangs = line.content.every((piece) => !piece.align || piece.align === "left");
    const content: FormattedText[] = [];
    for (let start = 0; start < line.content.length; ) {
      const align = line.content[start]!.align ?? "";
      let end = start;
      while (end < line.content.length && (line.content[end]!.align ?? "") === align) end++;
      const group = line.content.slice(start, end);
      if (group.some((piece) => [...piece.text].some(isPrinted))) {
        const text = rowMark(levels, row === 0);
        const { at: _at, text: _text, align: _align, ...style } = markStyle;
        content.push({
          ...style,
          ...(align ? { align } : {}),
          ...(hangs && text.length <= HANG_LIMIT ? { hang: text.length } : {}),
          text,
          ...(positions ? { at: insertedRun(text.length, groupAnchor(group)) } : {}),
        });
        row++;
      }
      content.push(...group);
      start = end;
    }
    line.content = content;
  }
};
