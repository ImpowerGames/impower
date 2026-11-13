import { ASSET_VALUE_CLAUSE_WORDS } from "../../../language/sparkdown.clause-words";
import { LayoutVerb, isLayoutVerb } from "../../../language/sparkdown.layout-verbs";
import { type SyntaxNode } from "@lezer/common";
import { choiceTextRanges, type TextRange } from "./readChoiceText";

export const DIRECTIVE_CONTROL_WORDS: readonly string[] = [
  "show",
  "hide",
  "animate",
  "play",
  "stop",
  "fade",
  "queue",
  "await",
  "write",
  "load",
];

export const DIRECTIVE_LOAD_WORDS: readonly string[] = ["load"];

export const DIRECTIVE_MOVIE_WORDS: readonly string[] = ["play"];

export const DIRECTIVE_VALUE_WORDS: readonly string[] = ASSET_VALUE_CLAUSE_WORDS;

export const DIRECTIVE_FLAG_WORDS: readonly string[] = ["wait", "loop", "once", "mute", "unmute", "now"];

export const DIRECTIVE_CLAUSE_WORDS: readonly string[] = [...DIRECTIVE_VALUE_WORDS, ...DIRECTIVE_FLAG_WORDS];

export type DirectiveBracket = "image" | "audio";

export type DirectiveKind = "image" | "layout" | "load" | "cutscene" | "audio";

export interface DirectiveWord {
  text: string;
  from: number;
  to: number;
}

export interface DirectiveClause<W extends { text: string } = DirectiveWord> {
  word: W;
  takesValue: boolean;
  value?: W;
}

export type DirectiveClauseValues = Record<string, string | true | undefined>;

export interface DirectiveReading {
  bracket: DirectiveBracket;
  kind: DirectiveKind;
  words: DirectiveWord[];
  control?: DirectiveWord;
  target?: DirectiveWord;
  names: DirectiveWord[];
  destination?: DirectiveWord;
  clauses: DirectiveClause[];
  values: DirectiveClauseValues;
}

export const DIRECTIVE_CLOSERS: Readonly<Record<DirectiveBracket, string>> = { image: "]]", audio: "))" };

export function directiveWords(content: string): DirectiveWord[] {
  const words: DirectiveWord[] = [];
  for (const match of content.matchAll(/[^ \t]+/g)) {
    if (/^#+$/.test(match[0])) break;
    words.push({ text: match[0], from: match.index, to: match.index + match[0].length });
  }
  return words;
}

export function parseDirectiveClauses<W extends { text: string }>(words: readonly W[]): DirectiveClause<W>[] {
  const clauses: DirectiveClause<W>[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (DIRECTIVE_VALUE_WORDS.includes(word.text)) {
      i += 1;
      const value = words[i];
      clauses.push({ word, takesValue: true, ...(value ? { value } : {}) });
    } else {
      clauses.push({ word, takesValue: false });
    }
  }
  return clauses;
}

export function directiveClauseValues(clauses: readonly DirectiveClause<{ text: string }>[]): DirectiveClauseValues {
  const values: DirectiveClauseValues = {};
  for (const clause of clauses) {
    values[clause.word.text] = clause.takesValue ? clause.value?.text : true;
  }
  return values;
}

export function directiveKind(bracket: DirectiveBracket, content: string): DirectiveKind {
  if (bracket === "audio") return "audio";
  const verb = content.replaceAll("\t", " ").trimStart().split(" ")[0];
  if (!verb) return "image";
  if (DIRECTIVE_LOAD_WORDS.includes(verb)) return "load";
  if (isLayoutVerb(verb)) return "layout";
  if (DIRECTIVE_MOVIE_WORDS.includes(verb)) return "cutscene";
  return "image";
}

export function isDirectiveControl(kind: DirectiveKind, word: string): boolean {
  return kind === "layout" ? isLayoutVerb(word) : DIRECTIVE_CONTROL_WORDS.includes(word);
}

function splitNames(word: DirectiveWord): DirectiveWord[] {
  const names: DirectiveWord[] = [];
  let from = word.from;
  for (const part of word.text.split("+")) {
    if (part) names.push({ text: part, from, to: from + part.length });
    from += part.length + 1;
  }
  return names;
}

export function readDirective(
  bracket: DirectiveBracket,
  content: string,
  kind: DirectiveKind = directiveKind(bracket, content),
): DirectiveReading {
  const words = directiveWords(content);
  const reading: DirectiveReading = { bracket, kind, words, names: [], clauses: [], values: {} };
  if (kind === "layout" && words[0]?.text === LayoutVerb.navigate) {
    reading.control = words[0];
    let i = 1;
    const screen = words[i];
    if (screen && !DIRECTIVE_CLAUSE_WORDS.includes(screen.text)) {
      reading.target = screen;
      i += 1;
    }
    if (words[i]?.text === "to") {
      i += 1;
      const destination = words[i];
      if (destination) {
        reading.destination = destination;
        i += 1;
      }
    }
    reading.clauses = parseDirectiveClauses(words.slice(i));
    reading.values = directiveClauseValues(reading.clauses);
    return reading;
  }
  let rest = words;
  if (words[0] && isDirectiveControl(kind, words[0].text)) {
    reading.control = words[0];
    if (words[1]) reading.target = words[1];
    rest = words.slice(2);
  }
  const clauseAt = rest.findIndex((word) => DIRECTIVE_CLAUSE_WORDS.includes(word.text));
  const nameWords = clauseAt >= 0 ? rest.slice(0, clauseAt) : rest;
  reading.names = nameWords.flatMap(splitNames);
  reading.clauses = parseDirectiveClauses(clauseAt >= 0 ? rest.slice(clauseAt) : []);
  reading.values = directiveClauseValues(reading.clauses);
  return reading;
}

export interface SourceDirective extends DirectiveReading {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

export const DIRECTIVE_NODE_BRACKETS: Readonly<Record<string, DirectiveBracket>> = {
  ImageCommand: "image",
  AudioCommand: "audio",
};

export interface DirectiveNodeRef {
  name: string;
  from: number;
  to: number;
  node?: SyntaxNode;
}

function rangesFrom(at: number, ranges: readonly TextRange[]): TextRange[] | undefined {
  const index = ranges.findIndex((range) => range.from <= at && at < range.to);
  return index < 0 ? undefined : [{ from: at, to: ranges[index]!.to }, ...ranges.slice(index + 1)];
}

function directiveTexts(node: DirectiveNodeRef): TextRange[][] {
  let choice = node.node?.parent ?? null;
  while (choice && choice.name !== "Choice") choice = choice.parent;
  const game = choice ? choiceTextRanges(choice) : undefined;
  const texts = game
    ? [game.chosen, game.offered].map((ranges) => rangesFrom(node.from, ranges)).filter((ranges) => ranges !== undefined)
    : [];
  return texts.length > 0 ? texts : [[{ from: node.from, to: node.to }]];
}

function composeText(ranges: TextRange[], read: (from: number, to: number) => string) {
  const starts: number[] = [];
  let text = "";
  for (const range of ranges) {
    starts.push(text.length);
    text += read(range.from, range.to);
  }
  return { ranges, starts, text };
}

export function readSourceDirective(
  node: DirectiveNodeRef,
  read: (from: number, to: number) => string,
): SourceDirective | undefined {
  const bracket = Object.hasOwn(DIRECTIVE_NODE_BRACKETS, node.name) ? DIRECTIVE_NODE_BRACKETS[node.name] : undefined;
  if (!bracket) return undefined;
  const closer = DIRECTIVE_CLOSERS[bracket];
  const found = directiveTexts(node)
    .map((ranges) => composeText(ranges, read))
    .find(({ text }) => text.indexOf(closer, 2) >= 0);
  if (!found) return undefined;
  const { ranges, starts, text } = found;
  const closeAt = text.indexOf(closer, 2);
  const sourceAt = (index: number): number => {
    let i = ranges.length - 1;
    while (i > 0 && starts[i]! > index) i -= 1;
    return ranges[i]!.from + index - starts[i]!;
  };
  const reading = readDirective(bracket, text.slice(2, closeAt));
  const shift = (word: DirectiveWord): DirectiveWord => ({
    text: word.text,
    from: sourceAt(word.from + 2),
    to: sourceAt(word.to + 1) + 1,
  });
  const contentFrom = node.from + 2;
  return {
    bracket,
    kind: reading.kind,
    words: reading.words.map(shift),
    ...(reading.control ? { control: shift(reading.control) } : {}),
    ...(reading.target ? { target: shift(reading.target) } : {}),
    names: reading.names.map(shift),
    ...(reading.destination ? { destination: shift(reading.destination) } : {}),
    clauses: reading.clauses.map((clause) => ({
      word: shift(clause.word),
      takesValue: clause.takesValue,
      ...(clause.value ? { value: shift(clause.value) } : {}),
    })),
    values: reading.values,
    from: node.from,
    to: Math.max(node.to, sourceAt(closeAt + 1) + 1),
    contentFrom,
    contentTo: sourceAt(closeAt),
  };
}

export function readSourceDirectives(
  tree: { iterate(spec: { enter(node: DirectiveNodeRef): boolean | void }): void },
  read: (from: number, to: number) => string,
): SourceDirective[] {
  const directives: SourceDirective[] = [];
  tree.iterate({
    enter: (node) => {
      if (!Object.hasOwn(DIRECTIVE_NODE_BRACKETS, node.name)) return undefined;
      const directive = readSourceDirective(node, read);
      if (directive) directives.push(directive);
      return false;
    },
  });
  return directives;
}

const TIME_VALUE = /^-?(?:\d*[.])?\d+(?:ms|s)$/;
const NUMBER_VALUE = /^-?(?:\d*[.])?\d+$/;
const NAME_VALUE = /^[_\p{L}][0-9_\p{L}-]*(?:@[0-9_\p{L}][0-9_\p{L}-]*)*(?<!-)$/u;

export type DirectiveValueKind = "time" | "number" | "name" | "other";

export function directiveValueKind(text: string): DirectiveValueKind {
  if (TIME_VALUE.test(text)) return "time";
  if (NUMBER_VALUE.test(text)) return "number";
  if (NAME_VALUE.test(text)) return "name";
  return "other";
}

export function directiveClauseWords(directive: DirectiveReading): DirectiveWord[] {
  return directive.clauses.flatMap((clause) => [clause.word, ...(clause.value ? [clause.value] : [])]);
}
