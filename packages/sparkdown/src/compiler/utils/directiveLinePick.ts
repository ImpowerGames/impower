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
  node.name === "Tags" ||
  node.name.startsWith("LuauSparkdownVariable");

const constructAt = (tree: Tree, at: number): SyntaxNode | null => {
  let node: SyntaxNode | null = tree.resolveInner(at, 1);
  while (node && !isDisplay(node) && !ASSET_LINES.has(node.name)) {
    node = node.parent;
  }
  for (let outer = node?.parent ?? null; outer; outer = outer.parent) {
    if (isDisplay(outer)) return outer;
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

const CHOICES = new Set(["LuauSparkdownChooseBlock", "Choice"]);

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
  const followed = new Set<string>();
  let node = own.nextSibling;
  while (node) {
    if (passesThrough(node)) {
      node = node.nextSibling;
      continue;
    }
    if (node.name === "Divert") {
      const name = divertTarget(node, read);
      const scene = followed.has(name) ? null : sceneNamed(tree, read, name);
      if (!scene) return ownSpeaker;
      followed.add(name);
      node = scene.nextSibling;
      continue;
    }
    if (CHOICES.has(node.name)) return undefined;
    if (!isDisplay(node)) return ownSpeaker;
    const display = node;
    if ((displayBeatRanges(display, source) ?? []).some((range) => writesText(display, range, read))) {
      return speakerOf(context, names, display, read);
    }
    node = node.nextSibling;
  }
  return ownSpeaker;
};

const divertTarget = (divert: SyntaxNode, read: Read) => {
  const target = divert.getChild("Divert_content")?.getChild("DivertTarget");
  return target ? read(target.from, target.to).trim() : "";
};

const sceneNamed = (tree: Tree, read: Read, name: string): SyntaxNode | null => {
  if (!name) return null;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "Scene") continue;
    const content = node.getChild("Scene_content");
    const declared = content ? read(content.from, content.to).trim().split(/[\s(]/)[0] : "";
    if (declared === name) return node;
  }
  return null;
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
