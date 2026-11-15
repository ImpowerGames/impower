import type { SyntaxNode, Tree } from "@lezer/common";
import { stripStyleCodes } from "../../runtime/displayStyle";
import { readStyledSource } from "../lower/utils/displaySpans";
import { DISPLAY_LINE_TYPES, displayBeatRanges, readCueSource } from "../lower/lowerers/lowerDisplay";
import { characterNames, cueCharacter, type CharacterNames } from "./cueCharacter";
import { linePick } from "./linePick";
import type { ImageLayer } from "./resolveImageLayers";
import { readSourceDirectives, type SourceDirective } from "./readDirective";

type Read = (from: number, to: number) => string;

interface DirectiveSource {
  read: Read;
  characterNumber: (pos: number) => number;
}

const ASSET_LINES = new Set(["ImageLine", "AudioLine", "ImageAndAudioLine", "AssetLine"]);

const DIRECTIVE = /\[\[.*?\]\]|\(\(.*?\)\)/gs;

const isDisplay = (node: SyntaxNode) => Object.hasOwn(DISPLAY_LINE_TYPES, node.name);

const passesThrough = (node: SyntaxNode) =>
  ASSET_LINES.has(node.name) ||
  node.name === "Newline" ||
  node.name.endsWith("Whitespace") ||
  node.name.includes("Comment") ||
  node.name.startsWith("LuauSparkdownVariable");

const constructAt = (tree: Tree, at: number): SyntaxNode | null => {
  let node: SyntaxNode | null = tree.resolveInner(at, 1);
  while (node && !isDisplay(node) && !ASSET_LINES.has(node.name)) {
    node = node.parent;
  }
  return node;
};

const writesText = (node: SyntaxNode, range: { from: number; to: number }, read: Read) => {
  let text = stripStyleCodes(readStyledSource(node, range.from, range.to, { read }));
  const removeComments = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= range.from || child.from >= range.to) continue;
      if (child.name.includes("Comment")) {
        text = text.replace(read(child.from, child.to), "");
      } else {
        removeComments(child);
      }
    }
  };
  removeComments(node);
  return text.replace(DIRECTIVE, "").trim().length > 0;
};

const speakerOf = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  node: SyntaxNode,
  read: Read,
): string | undefined => {
  const cue = DISPLAY_LINE_TYPES[node.name] === "dialogue" ? readCueSource(node, { read }) : null;
  return cue ? cueCharacter(context, names, cue) : undefined;
};

const lineSpeaker = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  tree: Tree,
  source: DirectiveSource,
  at: number,
): string | undefined => {
  const { read } = source;
  const own = constructAt(tree, at);
  if (!own) return undefined;
  const ownSpeaker = isDisplay(own) ? speakerOf(context, names, own, read) : undefined;
  const ownBeats = isDisplay(own) ? (displayBeatRanges(own, source) ?? []).filter((range) => range.to >= at) : [];
  if (ownBeats.some((range) => writesText(own, range, read))) {
    return ownSpeaker;
  }
  for (let next = own.nextSibling; next; next = next.nextSibling) {
    if (passesThrough(next)) continue;
    if (!isDisplay(next)) break;
    if ((displayBeatRanges(next, source) ?? []).some((range) => writesText(next, range, read))) {
      return speakerOf(context, names, next, read);
    }
  }
  return ownSpeaker;
};

export interface DirectiveLine {
  pick?: string;
  speaker?: string;
}

export const directiveLine = (
  context: Record<string, any>,
  tree: Tree,
  source: DirectiveSource,
  at: number,
  names: CharacterNames = characterNames(context),
  directives: readonly SourceDirective[] = readSourceDirectives(tree, source.read),
): DirectiveLine | undefined => {
  const directive = directives.find(
    (directive) => directive.contentFrom <= at && at < directive.contentTo,
  );
  if (directive?.kind !== "image") return undefined;
  const written = directive.values["morph"];
  const speaker = lineSpeaker(context, names, tree, source, at);
  return {
    ...(typeof written === "string" ? { pick: written } : {}),
    ...(speaker !== undefined ? { speaker } : {}),
  };
};

export const linePickOf = (
  context: Record<string, any>,
  imageName: string,
  line: DirectiveLine | undefined,
): ((layer: ImageLayer) => string | undefined) | undefined =>
  line ? (layer) => linePick(context, imageName, layer, line.pick, line.speaker) : undefined;
