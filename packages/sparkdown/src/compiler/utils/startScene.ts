import type { SyntaxNode } from "@lezer/common";
import { START_FLOW_NAME } from "../../program/ProgramSymbols";
import { findWithin } from "./declarationOnly";

/** What a project with no scene named start reports, on the first line of
 *  the script it compiles from. */
export const NO_START_SCENE_MESSAGE =
  "no scene named start; the story starts in a scene named start";

/** What a start scene that takes parameters reports, on its header. */
export const START_SCENE_PARAMETERS_MESSAGE =
  "scene start cannot take parameters; the story starts there with none";

/** Whether `message` is one of the start scene's errors, which say nothing
 *  of how the line they stand on reads: the reporters of syntax errors do
 *  not take them for a report of that line's errors. */
export const isStartSceneMessage = (message: string): boolean =>
  message === NO_START_SCENE_MESSAGE || message === START_SCENE_PARAMETERS_MESSAGE;

/** A script of the project, as its parse reads it. */
export interface StartSceneScript {
  uri: string;
  top: SyntaxNode;
  read: (from: number, to: number) => string;
}

/**
 * Where the story's start is wrong, as the script and the offset of the line
 * each report stands on: the first line of `scripts[0]`, the script the
 * compile starts from, when no script declares a scene named start, and the
 * header of each start scene that takes parameters. Two start scenes are the
 * duplicate scene any two scenes of one name are.
 */
export const startSceneProblems = (
  scripts: readonly StartSceneScript[],
): { uri: string; from: number; message: string }[] => {
  const problems: { uri: string; from: number; message: string }[] = [];
  let declared = false;
  for (const { uri, top, read } of scripts) {
    for (let node = top.firstChild; node; node = node.nextSibling) {
      if (node.name !== "Scene") {
        continue;
      }
      const name = findWithin(node, "SceneDeclarationName");
      if (!name || read(name.from, name.to).trim() !== START_FLOW_NAME) {
        continue;
      }
      declared = true;
      const parameters = findWithin(node, "LuauFunctionParameters");
      if (
        parameters &&
        (findWithin(parameters, "LuauFunctionParameter") ||
          findWithin(parameters, "LuauVariadicParameter"))
      ) {
        problems.push({ uri, from: node.from, message: START_SCENE_PARAMETERS_MESSAGE });
      }
    }
  }
  const entry = scripts[0];
  if (!declared && entry) {
    problems.unshift({ uri: entry.uri, from: 0, message: NO_START_SCENE_MESSAGE });
  }
  return problems;
};
