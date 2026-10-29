import type { SyntaxNode } from "@lezer/common";
import { START_FLOW_NAME } from "../../program/ProgramSymbols";
import { findWithin } from "./declarationOnly";

export const NO_START_SCENE_MESSAGE =
  "no scene named start; the story starts in a scene named start";

export const START_SCENE_PARAMETERS_MESSAGE =
  "scene start cannot take parameters; the story starts there with none";

export const isStartSceneMessage = (message: string): boolean =>
  message === NO_START_SCENE_MESSAGE || message === START_SCENE_PARAMETERS_MESSAGE;

export interface StartSceneScript {
  uri: string;
  top: SyntaxNode;
  read: (from: number, to: number) => string;
}

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
