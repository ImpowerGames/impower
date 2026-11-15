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

const lineSpeakers = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  tree: Tree,
  source: DirectiveSource,
  at: number,
): (string | undefined)[] => {
  const { read } = source;
  const own = constructAt(tree, at);
  if (!own) return [undefined];
  const ownSpeaker = isDisplay(own) ? speakerOf(context, names, own, read) : undefined;
  const ownBeats = isDisplay(own) ? (displayBeatRanges(own, source) ?? []).filter((range) => range.to >= at) : [];
  if (ownBeats.some((range) => writesText(own, range, read))) {
    return [ownSpeaker];
  }
  const speakers: (string | undefined)[] = [];
  const add = (speaker: string | undefined) => {
    if (!speakers.includes(speaker)) speakers.push(speaker);
  };
  const followed = new Set<string>();
  let steps = 0;
  const visit = (start: SyntaxNode | null, stop: Stop | undefined, rest: readonly Frame[]): void => {
    let node = start;
    let until = stop;
    let resume = rest;
    for (;;) {
      if (++steps > MAX_STEPS) return;
      if (!node || until?.(node)) {
        const frame = resume[resume.length - 1];
        if (!frame) {
          add(ownSpeaker);
          return;
        }
        resume = resume.slice(0, -1);
        node = frame.node;
        until = frame.stop;
        continue;
      }
      if (passesThrough(node)) {
        node = node.nextSibling;
        continue;
      }
      if (node.name === "Divert") {
        const name = divertTarget(node, read);
        const scene = followed.has(name) ? null : sceneNamed(tree, read, name);
        if (!scene) return;
        followed.add(name);
        node = scene.nextSibling;
        until = undefined;
        resume = [];
        continue;
      }
      if (CHOICES.has(node.name)) {
        add(undefined);
        return;
      }
      const branching = branchesOf(node);
      if (branching) {
        const after = [...resume, { node: node.nextSibling, stop: until }];
        for (const branch of branching.branches) visit(branch.start, branch.stop, after);
        if (!branching.skippable) return;
        node = node.nextSibling;
        continue;
      }
      if (!isDisplay(node)) {
        add(ownSpeaker);
        return;
      }
      const display = node;
      if ((displayBeatRanges(display, source) ?? []).some((range) => writesText(display, range, read))) {
        add(speakerOf(context, names, display, read));
        return;
      }
      node = node.nextSibling;
    }
  };
  const enclosing = enclosingFrames(own);
  visit(own.nextSibling, enclosing.stop, enclosing.frames);
  return speakers.length > 0 ? speakers : [ownSpeaker];
};

const MAX_STEPS = 256;

type Stop = (node: SyntaxNode) => boolean;

interface Frame {
  node: SyntaxNode | null;
  stop: Stop | undefined;
}

interface Branch {
  start: SyntaxNode | null;
  stop: Stop | undefined;
}

const CHOICES = new Set(["LuauSparkdownChooseBlock", "Choice"]);

const IF_BLOCKS = new Set(["LuauSparkdownIfBlock"]);

const ALTERNATOR_BLOCKS = new Set(["LuauSparkdownSequentialAlternatorBlock", "LuauSparkdownConditionalAlternatorBlock"]);

const IF_BRANCHES = new Set(["LuauSparkdownElseifBlock", "LuauSparkdownElseBlock"]);

const endsIfBranch: Stop = (node) => IF_BRANCHES.has(node.name);

const endsAlternatorBranch: Stop = (node) => node.name === "LuauAlternatorSeparator";

const afterCondition = (content: SyntaxNode | null) => {
  let node = content?.firstChild ?? null;
  while (node && (node.name.includes("Condition") || node.name.endsWith("Whitespace"))) node = node.nextSibling;
  return node;
};

const branchesOf = (node: SyntaxNode): { branches: Branch[]; skippable: boolean } | undefined => {
  if (IF_BLOCKS.has(node.name)) {
    const content = node.getChild(`${node.name}_content`);
    const branches: Branch[] = [{ start: afterCondition(content), stop: endsIfBranch }];
    let skippable = true;
    for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
      if (!IF_BRANCHES.has(child.name)) continue;
      if (child.name === "LuauSparkdownElseBlock") skippable = false;
      branches.push({ start: afterCondition(child.getChild(`${child.name}_content`)), stop: undefined });
    }
    return { branches, skippable };
  }
  if (ALTERNATOR_BLOCKS.has(node.name)) {
    const content = node.getChild(`${node.name}_content`);
    const branches: Branch[] = [];
    for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
      if (child.name === "LuauAlternatorSeparator") branches.push({ start: child.nextSibling, stop: endsAlternatorBranch });
    }
    return { branches, skippable: true };
  }
  return undefined;
};

const enclosingFrames = (own: SyntaxNode): { stop: Stop | undefined; frames: Frame[] } => {
  const levels: { stop: Stop | undefined; block: SyntaxNode | null }[] = [];
  for (let parent = own.parent; parent?.parent; parent = parent.parent) {
    const block = parent.parent;
    if (parent.name !== `${block.name}_content`) continue;
    if (IF_BLOCKS.has(block.name)) levels.push({ stop: endsIfBranch, block });
    else if (IF_BRANCHES.has(block.name)) levels.push({ stop: undefined, block: block.parent?.parent ?? null });
    else if (ALTERNATOR_BLOCKS.has(block.name)) levels.push({ stop: endsAlternatorBranch, block });
  }
  const frames = levels
    .map((level, i) => ({ node: level.block?.nextSibling ?? null, stop: levels[i + 1]?.stop }))
    .reverse();
  return { stop: levels[0]?.stop, frames };
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
  speakers: (string | null)[];
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
  return {
    ...(typeof written === "string" ? { pick: written } : {}),
    speakers: lineSpeakers(context, names, tree, source, at).map((speaker) => speaker ?? null),
  };
};

export const linePicksOf = (
  context: Record<string, any>,
  imageName: string,
  line: DirectiveLine | undefined,
): { speaker: string | undefined; pickOf: (layer: ImageLayer) => string | undefined }[] | undefined =>
  line?.speakers.map((entry) => {
    const speaker = entry ?? undefined;
    return { speaker, pickOf: (layer: ImageLayer) => linePick(context, imageName, layer, line.pick, speaker) };
  });

export const linePickOf = (
  context: Record<string, any>,
  imageName: string,
  line: DirectiveLine | undefined,
): ((layer: ImageLayer) => string | undefined) | undefined => linePicksOf(context, imageName, line)?.[0]?.pickOf;
