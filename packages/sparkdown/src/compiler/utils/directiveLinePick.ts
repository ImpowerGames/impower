import type { Tree } from "@lezer/common";
import { DISPLAY_LINE_TYPES, readCueSource } from "../lower/lowerers/lowerDisplay";
import { ASSET_LINE_REGEX } from "./assetLine";
import { characterNames, cueCharacter, type CharacterNames } from "./cueCharacter";
import { linePick } from "./linePick";
import { readSourceDirectives, type SourceDirective } from "./readDirective";

const CHUNK = 512;

function* linesFrom(
  read: (from: number, to: number) => string,
  length: number,
  at: number,
): Generator<{ from: number; text: string }> {
  let from = at;
  while (from > 0) {
    const before = read(Math.max(0, from - CHUNK), from);
    const newline = before.lastIndexOf("\n");
    if (newline >= 0) {
      from = from - before.length + newline + 1;
      break;
    }
    from -= before.length;
  }
  while (from <= length) {
    let to = from;
    let text = "";
    for (;;) {
      const chunk = read(to, Math.min(length, to + CHUNK));
      const newline = chunk.indexOf("\n");
      if (newline >= 0) {
        text += chunk.slice(0, newline);
        to += newline;
        break;
      }
      text += chunk;
      to += chunk.length;
      if (to >= length) break;
    }
    yield { from, text: text.replace(/\r$/, "") };
    from = to + 1;
  }
}

const displayLineAt = (tree: Tree, at: number) => {
  let line = tree.resolveInner(at, 1) as ReturnType<Tree["resolveInner"]> | null;
  while (line && !Object.hasOwn(DISPLAY_LINE_TYPES, line.name)) {
    line = line.parent;
  }
  return line;
};

const speakerOf = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  line: ReturnType<typeof displayLineAt>,
  read: (from: number, to: number) => string,
): string | undefined => {
  const cue = line && DISPLAY_LINE_TYPES[line.name] === "dialogue" ? readCueSource(line, { read }) : null;
  return cue ? cueCharacter(context, names, cue) : undefined;
};

const lineSpeaker = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  tree: Tree,
  read: (from: number, to: number) => string,
  at: number,
): string | undefined => {
  const own = speakerOf(context, names, displayLineAt(tree, at), read);
  const lines = linesFrom(read, tree.length, at);
  const first = lines.next().value;
  if (!first || !ASSET_LINE_REGEX.test(first.text)) {
    return own;
  }
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("--") || ASSET_LINE_REGEX.test(line.text)) {
      continue;
    }
    const next = displayLineAt(tree, line.from + line.text.length - line.text.trimStart().length);
    return next ? speakerOf(context, names, next, read) : own;
  }
  return own;
};

export const directiveLinePick = (
  context: Record<string, any>,
  tree: Tree,
  read: (from: number, to: number) => string,
  at: number,
  imageName: string,
  names: CharacterNames = characterNames(context),
  directives: readonly SourceDirective[] = readSourceDirectives(tree, read),
): string | undefined => {
  const directive = directives.find(
    (directive) => directive.contentFrom <= at && at < directive.contentTo,
  );
  const pick = directive?.kind === "image" ? directive.values["morph"] : undefined;
  return linePick(
    context,
    [imageName],
    typeof pick === "string" ? pick : undefined,
    lineSpeaker(context, names, tree, read, at),
  );
};
