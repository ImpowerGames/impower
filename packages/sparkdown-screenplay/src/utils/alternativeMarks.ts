import type { PrintedRowSide } from "../types/LineOptions";
import type { ScreenplayToken } from "../types/ScreenplayToken";
import { insertAnchor, insertedAt, UNPLACED } from "./printedPosition";

export const GLUED_ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

export const ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set([
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownConditionalAlternatorBlock",
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

const markLines = (
  value: string,
  at: readonly number[] | undefined,
  markOf: (line: number) => string,
): { value: string; at?: number[] } => {
  let marked = "";
  const placed: number[] | undefined = at ? [] : undefined;
  let line = 0;
  let from = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\n" || (index > 0 && value[index - 1] !== "\n")) continue;
    const mark = markOf(line++);
    if (!mark) continue;
    marked += value.slice(from, index) + mark;
    if (placed) {
      for (let kept = from; kept < index; kept++) placed.push(at![kept]!);
      placed.push(...insertedRun(mark.length, anchorAt(at!, index, 1)));
    }
    from = index;
  }
  marked += value.slice(from);
  if (placed) for (let kept = from; kept < value.length; kept++) placed.push(at![kept]!);
  return placed ? { value: marked, at: placed } : { value: marked };
};

const markBody = (token: ScreenplayToken, first: boolean) => {
  const markOf = (line: number) => alternativeLine(first && line === 0 ? "first" : "rest");
  const affix = token.prefix ?? "";
  const styled = markLines(affix + (token.styled ?? token.text ?? ""), token.at, markOf);
  const text = markLines(token.text ?? "", undefined, (line) => (affix && line === 0 ? "" : markOf(line)));
  const prefixLength = affix ? markOf(0).length + affix.length : 0;
  if (affix) token.prefix = styled.value.slice(0, prefixLength);
  token.styled = styled.value.slice(prefixLength);
  token.text = text.value;
  if (styled.at) token.at = styled.at;
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
      if (PRINTED_TAGS.has(tokens[token]!.tag)) body.push(token);
    }
    if (body.length > 0) bodies.push(body);
  });
  if (bodies.length < 2) return;
  for (const body of bodies) body.forEach((token, index) => markBody(tokens[token]!, index === 0));
  const first = tokens[bodies[0]![0]!]!;
  const lastIndex = bodies.at(-1)!.at(-1)!;
  const last = tokens[lastIndex]!;
  const openAnchor = first.at && anchorAt(first.at, 0, 1);
  const closeAnchor = last.at && anchorAt(last.at, last.at.length - 1, -1);
  tokens.splice(lastIndex + 1, 0, markRow("close", closeAnchor, "below", positions));
  tokens.splice(bodies[0]![0]!, 0, markRow("open", openAnchor, "above", positions));
};
