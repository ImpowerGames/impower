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

type AlternativeLine = "open" | "first" | "rest" | "close";

const alternativeLine = (line: AlternativeLine): string => {
  switch (line) {
    case "open":
      return alternativeMark("open");
    case "first":
      return `${alternativeMark("bar")} `;
    case "rest":
      return " ".repeat(alternativeMark("bar").length + 1);
    case "close":
      return alternativeMark("close");
  }
};

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

const anchorAt = (at: readonly number[], from: number, step: 1 | -1): number | undefined => {
  for (let index = from; index >= 0 && index < at.length; index += step) {
    const anchor = placedAnchor(at[index]!);
    if (anchor !== undefined) return anchor;
  }
  return undefined;
};

const insertedRun = (length: number, anchor: number | undefined): number[] =>
  new Array<number>(length).fill(anchor === undefined ? UNPLACED : insertedAt(anchor));

const anchorAfter = (at: readonly number[]): number | undefined => {
  for (let index = at.length - 1; index >= 0; index--) {
    const position = at[index]!;
    if (position >= 0) return position + 1;
    const anchor = insertAnchor(position);
    if (anchor !== undefined) return anchor;
  }
  return undefined;
};

const printedValue = (token: ScreenplayToken) => (token.prefix ?? "") + (token.styled ?? token.text ?? "");

const lineHasText = (value: string, from: number) => {
  for (let index = from; index < value.length && value[index] !== "\n"; index++) {
    if (!isStyleCode(value[index]!)) return true;
  }
  return false;
};

const printsText = (token: ScreenplayToken) =>
  [...printedValue(token)].some((character) => !isStyleCode(character) && /\S/.test(character));

const markLines = (
  value: string,
  at: readonly number[] | undefined,
  markOf: (line: number) => string,
): { value: string; at?: number[]; anchor?: number } => {
  let marked = "";
  const placed: number[] | undefined = at ? [] : undefined;
  let firstAnchor: number | undefined;
  let line = 0;
  let from = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\n" || (index > 0 && value[index - 1] !== "\n") || !lineHasText(value, index)) continue;
    const mark = markOf(line++);
    marked += value.slice(from, index) + mark;
    if (placed) {
      const anchor = anchorAt(at!, index, 1);
      if (line === 1) firstAnchor = anchor;
      for (let kept = from; kept < index; kept++) placed.push(at![kept]!);
      placed.push(...insertedRun(mark.length, anchor));
    }
    from = index;
  }
  marked += value.slice(from);
  if (placed) for (let kept = from; kept < value.length; kept++) placed.push(at![kept]!);
  return placed ? { value: marked, at: placed, anchor: firstAnchor } : { value: marked };
};

const markBody = (token: ScreenplayToken, first: boolean): number | undefined => {
  const affix = token.prefix ?? "";
  const markOf = (line: number) => alternativeLine(first && line === 0 ? "first" : "rest");
  const styled = markLines(printedValue(token), token.at, markOf);
  const prefixLength = affix ? markOf(0).length + affix.length : 0;
  if (affix) token.prefix = styled.value.slice(0, prefixLength);
  token.styled = styled.value.slice(prefixLength);
  if (styled.at) token.at = styled.at;
  return styled.anchor;
};

const markRow = (
  line: "open" | "close",
  anchor: number | undefined,
  row: PrintedRowSide,
  positions: boolean,
): ScreenplayToken => {
  const text = alternativeLine(line);
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
  let openAnchor: number | undefined;
  bodies.forEach((body, bodyIndex) =>
    body.forEach((token, index) => {
      const anchor = markBody(tokens[token]!, index === 0);
      if (bodyIndex === 0 && index === 0) openAnchor = anchor;
    }),
  );
  const lastIndex = bodies.at(-1)!.at(-1)!;
  const last = tokens[lastIndex]!;
  const closeAnchor = last.at && anchorAfter(last.at);
  tokens.splice(lastIndex + 1, 0, markRow("close", closeAnchor, "below", positions));
  tokens.splice(bodies[0]![0]!, 0, markRow("open", openAnchor, "above", positions));
};
