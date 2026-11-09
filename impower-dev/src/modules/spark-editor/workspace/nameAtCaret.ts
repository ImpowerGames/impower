import type { Position, Range } from "@impower/spark-editor-protocol/src/types";

export type NameKind =
  | "scene"
  | "branch"
  | "character"
  | "define"
  | "variable"
  | "picture"
  | "sound"
  | "file"
  | "name";

export type NameAtCaret = {
  name: string;
  kind: NameKind;
  definition: { uri: string; range: Range } | null;
};

export type HighlightLike = {
  uri?: string;
  range: Range;
  kind?: number;
};

const TEXT_KIND = 1;

const PICTURE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const SOUND = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|midi?)$/i;
const SCRIPT = /\.sd$/i;

export const isScriptUri = (uri: string) => SCRIPT.test(uri);

const contains = (range: Range, position: Position) =>
  range.start.line === position.line &&
  range.end.line === position.line &&
  range.start.character <= position.character &&
  position.character <= range.end.character;

export const nameRangeAt = (
  highlights: readonly HighlightLike[] | null | undefined,
  position: Position,
): Range | null =>
  highlights?.find(
    (highlight) =>
      highlight.kind !== TEXT_KIND && contains(highlight.range, position),
  )?.range ?? null;

export const lineOf = (text: string, line: number) =>
  text.split(/\r\n|\r|\n/)[line] ?? "";

export const textOf = (text: string, range: Range) =>
  lineOf(text, range.start.line).slice(
    range.start.character,
    range.end.character,
  );

export const kindOfDefinition = (
  uri: string,
  definitionLine: string,
): NameKind => {
  if (!SCRIPT.test(uri)) {
    if (PICTURE.test(uri)) return "picture";
    if (SOUND.test(uri)) return "sound";
    return "file";
  }
  const line = definitionLine.trim();
  if (/^scene\b/.test(line)) return "scene";
  if (/^branch\b/.test(line)) return "branch";
  if (/^define\s+\S+\s+as\s+character\b/.test(line)) return "character";
  if (/^define\b/.test(line)) return "define";
  if (/^(store|const|local|global)\b/.test(line)) return "variable";
  return "name";
};

export const isCue = (line: string, name: string) => {
  const trimmed = line.trim();
  return trimmed.startsWith(name) && /:\s*$/.test(trimmed);
};

export const definitionOf = (
  definitions: readonly HighlightLike[] | null | undefined,
): { uri: string; range: Range } | null => {
  const found = definitions?.find(
    (definition) => definition.uri && definition.kind !== TEXT_KIND,
  );
  return found?.uri ? { uri: found.uri, range: found.range } : null;
};

const KIND_LABELS: Record<NameKind, string> = {
  scene: "Show the scene.",
  branch: "Show the branch.",
  character: "Show the character.",
  define: "Show the defined name.",
  variable: "Show the stored value.",
  picture: "Show all linked assets.",
  sound: "Show all linked assets.",
  file: "Show all linked assets.",
  name: "Show where it is defined.",
};

export const definitionHint = (kind: NameKind) => KIND_LABELS[kind];

export const isAsset = (kind: NameKind) =>
  kind === "picture" || kind === "sound" || kind === "file";
