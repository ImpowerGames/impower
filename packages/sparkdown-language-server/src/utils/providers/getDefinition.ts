import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type Tree } from "@lezer/common";
import { DocumentHighlight, Location, type Position } from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getReferences } from "./getReferences";

export const getDefinition = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  program: SparkProgram | undefined,
  workspace: SparkdownLanguageServerWorkspace,
  position: Position,
): (Location & DocumentHighlight)[] | undefined => {
  const { references } = getReferences(document, tree, program, workspace, position, {
    searchOtherFiles: true,
    includeDeclaration: true,
    excludeUses: true,
    includeInterdependent: false,
    includeLinks: false,
    addAssetFiles: true,
  });
  const seen = new Set<string>();
  return references?.filter((reference) => {
    const key = `${reference.uri}:${reference.range.start.line}:${reference.range.start.character}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
