import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { createSparkdownParser } from "@impower/sparkdown/src/compiler/utils/createSparkdownParser";
import { type TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { linkedTypes } from "./getReferences";

export const NAME_REGEX = /^[_\p{L}][_\p{L}\p{N}]*(?:@[_\p{L}\p{N}]+)*$/u;

let cueParser: TextmateGrammarParser | undefined;

const CUE_SCENE_START = "scene start\n  ";

const isCueName = (name: string, quotes: ReadonlySet<string>): boolean => {
  if (!name || name.includes("\\") || [...quotes].some((q) => name.includes(q))) {
    return false;
  }
  cueParser ??= createSparkdownParser();
  const text = `${CUE_SCENE_START}${name}:\n    Hello.\nend\n`;
  let found = false;
  cueParser.parse(text).iterate({
    enter: (node) => {
      if (node.name === "DialogueCharacterName") {
        found ||=
          node.from === CUE_SCENE_START.length &&
          node.to === CUE_SCENE_START.length + name.length;
        return false;
      }
      return !found;
    },
  });
  return found;
};

const IGNORED_DECLARATIONS = new Set(["end", "param"]);

const ASSET_TYPES = new Set(["image", "audio", "video", "font"]);

export const getRenameRefusal = (
  workspace: Pick<
    SparkdownLanguageServerWorkspace,
    "uris" | "document" | "annotations" | "findFiles"
  >,
  program: SparkProgram | undefined,
  currentName: string,
  newName: string,
  resolvedSymbolIds: readonly string[] | undefined,
  cueQuotes?: ReadonlySet<string>,
): string | null => {
  if (cueQuotes) {
    if (!isCueName(newName, cueQuotes)) {
      return `${newName || "An empty name"} is not a valid cue name. A cue name is text a line of dialogue can start with before its colon: no :, { or }, no comment, no (…) or […] at its end, no space at either end, no backslash and no quote that would close its string.`;
    }
  } else if (!NAME_REGEX.test(newName)) {
    return `${newName || "An empty name"} is not a valid name. A name starts with a letter or _ and has only letters, digits and _, with an @ allowed between two of them.`;
  }
  if (newName === currentName) {
    return null;
  }
  const taken = `${newName} is already a name in this story.`;
  for (const id of resolvedSymbolIds ?? []) {
    const dot = id.indexOf(".");
    if (dot < 0) {
      continue;
    }
    const type = id.slice(0, dot);
    for (const each of [type, ...linkedTypes(program, type)]) {
      if (program?.context?.[each]?.[newName] !== undefined) {
        return taken;
      }
      if (ASSET_TYPES.has(each) && workspace.findFiles(newName, each).length) {
        return taken;
      }
    }
  }
  for (const uri of workspace.uris()) {
    const document = workspace.document(uri);
    const declarations = workspace.annotations(uri)?.declarations.iter();
    while (document && declarations?.value) {
      if (
        !IGNORED_DECLARATIONS.has(declarations.value.type) &&
        document.read(declarations.from, declarations.to).trim() === newName
      ) {
        return taken;
      }
      declarations.next();
    }
  }
  return null;
};
