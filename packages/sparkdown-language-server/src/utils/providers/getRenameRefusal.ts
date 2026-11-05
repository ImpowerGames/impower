import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const NAME_REGEX = /^[_\p{L}][_\p{L}\p{N}]*$/u;

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
): string | null => {
  if (!NAME_REGEX.test(newName)) {
    return `${newName || "An empty name"} is not a valid name. A name starts with a letter or _ and has only letters, digits and _.`;
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
    if (program?.context?.[type]?.[newName] !== undefined) {
      return taken;
    }
    if (ASSET_TYPES.has(type) && workspace.findFiles(newName, type).length) {
      return taken;
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
