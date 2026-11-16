import type { SyntaxNode, Tree } from "@lezer/common";
import { stripStyleCodes } from "../../runtime/displayStyle";
import type { BeatRange, ShownBeat } from "../../program/programShownBeat";
import { readStyledSource } from "../lower/utils/displaySpans";
import { DISPLAY_LINE_TYPES, displayBeatRanges, readCueSource } from "../lower/lowerers/lowerDisplay";
import { characterNames, cueCharacter, type CharacterNames } from "./cueCharacter";
import { linePick } from "./linePick";
import type { ImageLayer } from "./resolveImageLayers";
import { readSourceDirectives, type SourceDirective } from "./readDirective";

type Read = (from: number, to: number) => string;

export interface DirectiveSource {
  read: Read;
  characterNumber: (pos: number) => number;
  lineNumber: (pos: number) => number;
}

export type DirectiveSpeakers = Record<string, string | null>;

const ASSET_LINES = new Set(["ImageLine", "AudioLine", "ImageAndAudioLine", "AssetLine"]);

const DIRECTIVE = /\[\[.*?\]\]|\(\(.*?\)\)/gs;

const isDisplay = (node: SyntaxNode) => Object.hasOwn(DISPLAY_LINE_TYPES, node.name);

const constructAt = (tree: Tree, at: number): SyntaxNode | null => {
  let assetLine: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = tree.resolveInner(at, 1); node; node = node.parent) {
    if (isDisplay(node)) return node;
    if (!assetLine && ASSET_LINES.has(node.name)) assetLine = node;
  }
  return assetLine;
};

const INTERPOLATION = "LuauInterpolatedStringExpression";

const beatText = (node: SyntaxNode, range: { from: number; to: number }, read: Read) => {
  let text = stripStyleCodes(readStyledSource(node, range.from, range.to, { read }));
  let interpolates = false;
  const removeUnwritten = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= range.from || child.from >= range.to) continue;
      if (child.name.includes("Comment") || child.name === INTERPOLATION) {
        interpolates ||= child.name === INTERPOLATION;
        text = text.replace(read(child.from, child.to), "");
      } else {
        removeUnwritten(child);
      }
    }
  };
  removeUnwritten(node);
  return { writes: text.replace(DIRECTIVE, "").trim().length > 0, interpolates };
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

export const directiveSpeakerKey = (source: DirectiveSource, directive: SourceDirective): string =>
  `${source.lineNumber(directive.contentFrom)}:${source.characterNumber(directive.contentFrom)}`;

export const directiveSpeaker = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  tree: Tree,
  source: DirectiveSource,
  at: number,
  shownWith: (construct: BeatRange, interpolates: boolean) => ShownBeat,
): string | undefined => {
  const { read } = source;
  const own = constructAt(tree, at);
  if (!own) return undefined;
  const ownSpeaker = isDisplay(own) ? speakerOf(context, names, own, read) : undefined;
  const ownBeats = isDisplay(own)
    ? (displayBeatRanges(own, source) ?? []).filter((range) => range.to >= at).map((range) => beatText(own, range, read))
    : [];
  if (ownBeats.some((beat) => beat.writes)) {
    return ownSpeaker;
  }
  let end = own.to;
  while (end > own.from && !read(end - 1, end).trim()) end -= 1;
  const shown = shownWith(
    {
      startLine: source.lineNumber(own.from),
      startColumn: source.characterNumber(own.from),
      endLine: source.lineNumber(end),
      endColumn: source.characterNumber(end),
    },
    ownBeats.some((beat) => beat.interpolates),
  );
  if (shown.kind === "own") return ownSpeaker;
  if (shown.kind === "beat") return shown.character ? cueCharacter(context, names, shown.character) : undefined;
  return undefined;
};

export interface DirectiveLine {
  pick?: string;
  speaker?: string;
}

export const directiveLine = (
  tree: Tree,
  source: DirectiveSource,
  at: number,
  speakers: DirectiveSpeakers | undefined,
  directives: readonly SourceDirective[] = readSourceDirectives(tree, source.read),
): DirectiveLine | undefined => {
  const directive = directives.find(
    (directive) => directive.contentFrom <= at && at < directive.contentTo,
  );
  if (directive?.kind !== "image") return undefined;
  const written = directive.values["morph"];
  const speaker = speakers?.[directiveSpeakerKey(source, directive)] ?? undefined;
  return {
    ...(typeof written === "string" ? { pick: written } : {}),
    ...(speaker != null ? { speaker } : {}),
  };
};

export const directiveSpeakers = (
  context: Record<string, any>,
  tree: Tree,
  source: DirectiveSource,
  shownWith: (construct: BeatRange, interpolates: boolean) => ShownBeat,
  directives: readonly SourceDirective[] = readSourceDirectives(tree, source.read),
  names: CharacterNames = characterNames(context),
): DirectiveSpeakers => {
  const speakers: DirectiveSpeakers = {};
  for (const directive of directives) {
    if (directive.kind !== "image") continue;
    speakers[directiveSpeakerKey(source, directive)] =
      directiveSpeaker(context, names, tree, source, directive.contentFrom, shownWith) ?? null;
  }
  return speakers;
};

export const linePickOf = (
  context: Record<string, any>,
  imageName: string,
  line: DirectiveLine | undefined,
): ((layer: ImageLayer) => string | undefined) | undefined =>
  line ? (layer) => linePick(context, imageName, layer, line.pick, line.speaker) : undefined;
