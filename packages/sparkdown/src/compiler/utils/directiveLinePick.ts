import type { Tree } from "@lezer/common";
import { readCueSource } from "../lower/lowerers/lowerDisplay";
import { characterNames, cueCharacter, type CharacterNames } from "./cueCharacter";
import { linePick } from "./linePick";
import { readSourceDirectives, type SourceDirective } from "./readDirective";

const lineSpeaker = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  tree: Tree,
  read: (from: number, to: number) => string,
  at: number,
): string | undefined => {
  let line = tree.resolveInner(at, 1) as ReturnType<Tree["resolveInner"]> | null;
  while (line && line.name !== "BlockDialogue" && line.name !== "InlineDialogue") {
    line = line.parent;
  }
  const cue = line ? readCueSource(line, { read }) : null;
  return cue ? cueCharacter(context, names, cue) : undefined;
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
