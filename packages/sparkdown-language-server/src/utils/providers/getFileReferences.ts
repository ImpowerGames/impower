import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { DocumentHighlight, Location } from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getFileSymbol } from "./getFileSymbol";
import { collectReferencesForTarget } from "./getReferences";

export const getFileReferences = (
  workspace: SparkdownLanguageServerWorkspace,
  program: SparkProgram | undefined,
  uri: string,
): { references: (Location & DocumentHighlight)[] } | null => {
  const seed = getFileSymbol(workspace, uri);
  if (!seed) {
    return null;
  }
  const { references } = collectReferencesForTarget(
    program,
    workspace,
    { symbolName: seed.name, symbolIds: seed.symbolIds },
    {
      searchOtherFiles: true,
      includeDeclaration: true,
      includeInterdependent: false,
      includeLinks: true,
      addAssetFiles: false,
    },
  );
  return { references };
};
